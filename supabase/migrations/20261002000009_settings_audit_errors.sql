-- ② 게이트 1·3·3-1 (②-1): 설정 이력 · 변경 기록(감사 로그) 트리거 · 오류 기록 · 내려받기 기록
-- 원칙: 쓰기는 서버(service_role)만 (② 4-11). 브라우저 세션에는 아무 권한도 주지 않는다.

-- ─────────────────────────────────────────────
-- 설정 이력 (② 4-1) — 단일 행이 아니라 이력이다. 바꾸면 새 행을 넣는다 (update 금지 트리거)
-- 읽을 때는 "그 날짜 이전에 시작한 것 중 가장 최근" (src/lib/settings.ts getSettingAt 한 곳에서만)
-- ─────────────────────────────────────────────
create table public.app_settings (
  id             uuid primary key default gen_random_uuid(),
  key            text not null check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value          jsonb not null,
  effective_from date not null,
  updated_by     uuid references public.profiles(id),
  updated_at     timestamptz not null default now(),
  unique (key, effective_from)
);
create index on public.app_settings (key, effective_from desc);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
create trigger app_settings_no_update before update or delete on public.app_settings for each row execute function public.forbid_change();

-- ─────────────────────────────────────────────
-- 변경 기록 (② 4-3) — DB 트리거로 자동. 끄는 스위치를 만들지 않는다.
-- 누가: 로그인 세션이면 auth.uid(), 서버(service_role)가 쓴 것이면 행의 *_by 칸 (서버 API가 채운다)
-- 사유: 행의 note·reason·unlock_reason 칸이 있으면 그것
-- ─────────────────────────────────────────────
create table public.audit_logs (
  id           bigserial primary key,
  actor_id     uuid,
  action       text not null check (action in ('insert','update','delete')),
  target_table text not null,
  target_id    text,
  before_data  jsonb,
  after_data   jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index on public.audit_logs (target_table, target_id, created_at desc);
create index on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
-- 로그가 고쳐지면 로그가 아니다 — 서버 권한으로도 고치거나 지울 수 없다
create trigger audit_logs_no_change before update or delete on public.audit_logs for each row execute function public.forbid_change();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor uuid;
  why text;
begin
  -- 행이 누가 했는지 들고 있으면 그것, 아니면 로그인 세션
  actor := coalesce(
    nullif(rec->>'updated_by','')::uuid, nullif(rec->>'decided_by','')::uuid, nullif(rec->>'approved_by','')::uuid,
    nullif(rec->>'locked_by','')::uuid, nullif(rec->>'unlocked_by','')::uuid, nullif(rec->>'created_by','')::uuid,
    nullif(rec->>'requested_by','')::uuid, nullif(rec->>'run_by','')::uuid, auth.uid());
  why := coalesce(rec->>'unlock_reason', rec->>'reason', rec->>'note', rec->>'decision_note');
  insert into public.audit_logs (actor_id, action, target_table, target_id, before_data, after_data, reason)
  values (
    actor,
    lower(tg_op),
    tg_table_name,
    coalesce(rec->>'id', rec->>'year_month', rec->>'the_date', rec->>'notice_id', rec->>'key'),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    left(why, 500)
  );
  return coalesce(new, old);
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

-- 대상 표 (② 6장 트리거 목록 중 지금 있는 것. 새 표를 만들 때마다 여기 추가한다)
do $$
declare t text;
begin
  foreach t in array array['app_settings','punch_events','punch_corrections','overtime_requests','office_networks','work_rules',
                           'profiles','holidays','notices','notice_translations','notice_targets','user_passkeys','invites'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 오류 기록 (7-16) — 같은 오류는 한 줄로 묶는다 (dedup_key). 지우지 않고 해결 표시만.
-- ⚠️ detail에는 허용 목록 칸만 (src/lib/error-log.ts). 이 표에는 감사 트리거를 걸지 않는다 (그 자체가 기록)
-- ─────────────────────────────────────────────
create table public.app_errors (
  id            bigserial primary key,
  code          text not null,
  severity      text not null check (severity in ('info','warn','error')),
  route         text,
  dedup_key     text not null unique,
  occurrences   int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  affected_employee_ids uuid[] not null default '{}',
  detail        jsonb,
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles(id),
  resolution_note text
);
create index on public.app_errors (last_seen_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;
create trigger app_errors_no_delete before delete on public.app_errors for each row execute function public.forbid_change();

-- 같은 오류 묶기를 한 번에 (경합 없이): 있으면 횟수+1·마지막 시각·영향 직원 합치기, 해결된 줄이면 다시 열기
create or replace function public.log_app_error(p_code text, p_severity text, p_route text, p_dedup text, p_employee uuid, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.app_errors (code, severity, route, dedup_key, affected_employee_ids, detail)
  values (p_code, p_severity, p_route, p_dedup, case when p_employee is null then '{}' else array[p_employee] end, p_detail)
  on conflict (dedup_key) do update set
    occurrences = app_errors.occurrences + 1,
    last_seen_at = now(),
    detail = excluded.detail,
    affected_employee_ids = case
      when p_employee is null or p_employee = any(app_errors.affected_employee_ids) or cardinality(app_errors.affected_employee_ids) >= 50
        then app_errors.affected_employee_ids
      else app_errors.affected_employee_ids || p_employee end,
    resolved_at = null, resolved_by = null;
$$;
revoke all on function public.log_app_error(text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.log_app_error(text, text, text, text, uuid, jsonb) to service_role;

-- ─────────────────────────────────────────────
-- 내려받기 기록 (7-18) — 누가 언제 무엇을 내려받았는지
-- ─────────────────────────────────────────────
create table public.download_logs (
  id         bigserial primary key,
  actor_id   uuid not null references public.profiles(id),
  kind       text not null,
  scope      text not null,
  file_name  text not null,
  purpose    text,
  created_at timestamptz not null default now()
);
alter table public.download_logs enable row level security;
revoke all on public.download_logs from anon, authenticated;
create trigger download_logs_no_change before update or delete on public.download_logs for each row execute function public.forbid_change();
