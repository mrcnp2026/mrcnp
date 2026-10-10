-- 20261010000023_shifts.sql
-- 날짜별 근무일정 (의뢰인 2026-10-10: 시프티의 「근무일정」 — 특근·잔업·하루만 다른 시각을 사람·날짜별로 넣는다).
--   · shifts : 직원 · 날짜 · 시작/끝 · 유형 · 쓴 틀 · 메모. 하루에 여러 건 가능(정규 + 잔업). 지우지 않고 취소(active=false)한다 (4-6)
-- 그날 일정이 있으면 직원의 평소 틀(profiles.shift_template_id) 대신 이 일정으로 판정한다. 유형 「잔업」은 평소 일정에 끝 시각만 늘린다 (src/lib/shifts.ts planDay).
--
-- 되돌리는 방법: drop table public.shifts;  ⚠️ 넣은 날짜별 일정이 사라지고 평소 틀·회사 규칙으로 돌아간다 (출퇴근 기록은 남는다).

create table public.shifts (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  work_date   date not null,
  start_time  time not null,
  end_time    time not null,
  kind        text not null default 'none' check (kind in ('none','normal','deemed','outside','remote','holiday','extra')),
  template_id uuid references public.shift_templates(id),
  note        text check (note is null or char_length(note) <= 200),
  active      boolean not null default true,
  created_by  uuid references public.profiles(id),
  updated_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index on public.shifts (work_date);
create index on public.shifts (employee_id, work_date);

alter table public.shifts enable row level security;
-- 본인 일정은 본인이, 전체는 관리자가 읽는다. 쓰기는 서버(service_role)만
create policy shifts_select on public.shifts for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.shifts from anon, authenticated;
revoke all on public.shifts from anon;
create trigger shifts_no_delete before delete on public.shifts
  for each row execute function public.guard_columns();
create trigger shifts_audit after insert or update or delete on public.shifts
  for each row execute function public.audit_row();
