-- 20261010000022_shift_templates.sql
-- 근무일정 틀(템플릿) (의뢰인 2026-10-10: 시프티의 「근무일정 템플릿」 기준. 07:30·07:40·07:50 시작 등을 만들어 직원별로 적용, 간주 근무 포함).
--   · shift_templates          : 이름 · 시작/끝 시각 · 유형 · 색 · 메모. 지우지 않고 꺼 둔다 (4-6)
--   · profiles.shift_template_id : 그 직원에게 적용한 틀 (평소 근무일의 일정). 없으면 회사 근무규칙 그대로
-- 회사 근무규칙(지각 유예·휴게·근무 요일)은 그대로 쓰고 시작·끝 시각만 틀로 바꿔 끼운다 (src/lib/shifts.ts).
-- 날짜별 일정(특근·잔업 등)은 다음 단계에서 따로 표를 더한다.
--
-- 되돌리는 방법: alter table public.profiles drop column shift_template_id; drop table public.shift_templates;
--   ⚠️ 만든 틀과 직원별 적용이 사라지고, 모든 직원이 회사 근무규칙 시각으로 돌아간다 (출퇴근 기록은 남는다).

create table public.shift_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  start_time time not null,
  end_time   time not null,
  kind       text not null default 'none' check (kind in ('none','normal','deemed','outside','remote','holiday','extra')),
  color      text not null default 'primary' check (color in ('primary','ok','warn','danger','text','muted')),
  memo       text check (memo is null or char_length(memo) <= 200),
  active     boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_time > start_time)   -- 자정을 넘기는 일정은 아직 지원하지 않는다
);
create unique index shift_templates_unique_name on public.shift_templates (lower(btrim(name))) where active;

alter table public.shift_templates enable row level security;
-- 틀 이름·시각은 로그인한 사람 누구나 읽는다 (자기 일정 표시). 쓰기는 서버(service_role)만
create policy shift_templates_select on public.shift_templates for select to authenticated using (true);
revoke insert, update, delete, truncate on public.shift_templates from anon, authenticated;
revoke all on public.shift_templates from anon;
create trigger shift_templates_no_delete before delete on public.shift_templates
  for each row execute function public.guard_columns();
create trigger shift_templates_audit after insert or update or delete on public.shift_templates
  for each row execute function public.audit_row();

alter table public.profiles
  add column shift_template_id uuid references public.shift_templates(id);
create index on public.profiles (shift_template_id);
