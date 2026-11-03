-- 20261104000089_break_skip_requests.sql
-- 퇴근할 때 직원이 답하는 「저녁 휴게를 쉬었나요?」 (2026-11-04 의뢰인: 지금 방식 + 퇴근할 때 직원에게 묻기 + 지금 방식은 안전장치).
--   17:30 뒤 퇴근하면 앱이 묻고, 직원이 「못 쉬고 일했어요」를 누르면 여기 한 줄 남는다(대기).
--   관리자가 근태 점검에서 승인하면 그 휴게에 「휴게 안 함」(break_waivers)을 표시하고 이 줄은 approved, 아니면 rejected.
--   계산은 승인 전까지 그대로(휴게를 뺀다) — 직원의 답만으로는 급여가 바뀌지 않는다.
--
-- 되돌리는 방법: drop table public.break_skip_requests; (앱 코드를 먼저 예전으로)

create table public.break_skip_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  work_date    date not null,
  break_start  time not null,
  break_end    time not null check (break_end > break_start),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  is_test      boolean not null default true,
  created_at   timestamptz not null default now(),
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz,
  decide_note  text check (decide_note is null or char_length(decide_note) <= 200)
);
-- 같은 날 같은 휴게에 살아 있는(대기 · 승인) 답은 하나
create unique index break_skip_requests_one on public.break_skip_requests (employee_id, work_date, break_start, is_test) where status in ('pending', 'approved');
create index on public.break_skip_requests (work_date);

alter table public.break_skip_requests enable row level security;
create policy break_skip_requests_select on public.break_skip_requests for select to authenticated
  using (employee_id = (select auth.uid()) or (select private.is_admin()));
revoke insert, update, delete, truncate on public.break_skip_requests from anon, authenticated;
revoke all on public.break_skip_requests from anon;
-- 답한 사실은 고정, 처리 칸만 바뀐다. 삭제 금지 (4-1)
create trigger break_skip_requests_guard before update or delete on public.break_skip_requests
  for each row execute function public.guard_columns('status', 'decided_by', 'decided_at', 'decide_note');
create trigger break_skip_requests_no_truncate before truncate on public.break_skip_requests
  for each statement execute function public.forbid_change();
create trigger break_skip_requests_audit after insert or update or delete on public.break_skip_requests
  for each row execute function public.audit_row();
