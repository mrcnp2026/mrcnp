-- 20261002000004_invites_challenges.sql
-- 게이트 3·3-1: 초대 QR(사번만으로 등록, 7-12 요점 5)과 패스키 1회용 챌린지(요점 2) + 등록을 한 번에 처리하는 DB 함수.
--
-- 되돌리는 방법: drop function public.register_passkey; drop table public.webauthn_challenges, public.invites;
--   ⚠️ 초대 발급 기록이 사라진다. 운영 뒤에는 되돌리지 말고 새 마이그레이션으로 고친다 (R-12-6).

-- ─────────────────────────────────────────────
-- 초대 — 토큰 원문은 저장하지 않는다 (sha256 지문만). QR이 유출돼도 DB에서 토큰을 되살릴 수 없다
-- ─────────────────────────────────────────────
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  token_hash  text not null unique,
  -- 부록 R-2의 4: 'emergency'는 개발 PC의 비상 스크립트로만 발급된다. 관리자 홈에 표시할 근거가 이 칸이다
  issued_via  text not null default 'admin' check (issued_via in ('admin','emergency')),
  issued_by   uuid references public.profiles(id),   -- emergency면 null (사람이 아니라 스크립트)
  expires_at  timestamptz not null,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.invites (employee_id, created_at desc);

-- ─────────────────────────────────────────────
-- 패스키 챌린지 — 1회용·5분 만료 (7-12 요점 2). 쓰면 used_at이 찍히고 다시 쓸 수 없다
-- ─────────────────────────────────────────────
create table public.webauthn_challenges (
  challenge  text primary key,
  purpose    text not null check (purpose in ('register','login','punch')),
  invite_id  uuid references public.invites(id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- 둘 다 서버만 읽고 쓴다. 브라우저(anon·authenticated)는 읽기조차 못 한다 — 정책을 만들지 않고 권한도 회수
alter table public.invites             enable row level security;
alter table public.webauthn_challenges enable row level security;
revoke all on public.invites, public.webauthn_challenges from anon, authenticated;

-- 초대는 발급 기록이다: 지우지 않고, 사용·취소 시각만 바뀐다
create trigger invites_guard before update or delete on public.invites
  for each row execute function public.guard_columns('used_at', 'revoked_at');

-- ─────────────────────────────────────────────
-- 등록 한 번에: 초대 확인 → (비상 초대면 기존 폰 해제) → 패스키 저장 → 초대 사용 처리
-- 따로 하면 "초대만 쓰이고 저장은 실패" 같은 반쪽 상태가 생긴다. 초대 행을 잠가 동시 등록도 막는다.
-- 직원당 활성 패스키 1개는 one_active_passkey 유일 인덱스가 막는다 (23505).
-- ─────────────────────────────────────────────
create or replace function public.register_passkey(
  p_token_hash    text,
  p_credential_id text,
  p_public_key    bytea,
  p_sign_count    bigint,
  p_transports    text[],
  p_device_type   text,
  p_backed_up     boolean,
  p_device_label  text
)
returns table (passkey_id uuid, employee_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invites%rowtype;
  v_active boolean;
  v_id uuid;
begin
  select * into v_inv from public.invites i where i.token_hash = p_token_hash for update;
  if not found or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invite_invalid' using errcode = 'P0001';
  end if;

  select p.active into v_active from public.profiles p where p.id = v_inv.employee_id;
  if not coalesce(v_active, false) then
    raise exception 'employee_inactive' using errcode = 'P0001';
  end if;

  -- 부록 R-2의 4: 관리자 전원이 못 들어올 때의 비상 초대만 기존 폰을 해제하고 새로 등록한다.
  -- 일반 초대는 기존 폰이 있으면 실패한다 — 해제는 다른 관리자가 화면에서 한다 (R-2의 2, ②-3)
  if v_inv.issued_via = 'emergency' then
    update public.user_passkeys u set revoked_at = now()
     where u.employee_id = v_inv.employee_id and u.revoked_at is null;
  end if;

  insert into public.user_passkeys (employee_id, credential_id, public_key, sign_count, transports,
                                    device_type, backed_up, device_label)
  values (v_inv.employee_id, p_credential_id, p_public_key, p_sign_count, p_transports,
          p_device_type, p_backed_up, p_device_label)
  returning id into v_id;

  update public.invites i set used_at = now() where i.id = v_inv.id;

  return query select v_id, v_inv.employee_id;
end;
$$;
revoke execute on function public.register_passkey(text, text, bytea, bigint, text[], text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.register_passkey(text, text, bytea, bigint, text[], text, boolean, text)
  to service_role;
