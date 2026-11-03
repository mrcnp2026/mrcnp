-- 20261103000087_payroll_check.sql
-- 급여 점검 (결정 급여-68, 2026-11-03 의뢰인): 이번 달 근태 기록으로 엔진이 미리 계산하고, 계산 세부의 이상한 점(점검 항목)마다
--   관리자가 근거를 보고 「정산에 어떻게 반영할지」를 고른다. 그 결정을 여기 남긴다 — 누가 · 언제 · 무엇을 · 왜.
--   항목은 계산할 때마다 다시 만들어진다(저장하지 않는다). 결정은 (달 · 직원 · 항목) 하나에 하나만 살아 있고, 되돌리면 active=false로 남는다.
-- 계약 만료일: 근로계약 기간의 끝(대부분 1년). 계약 판(payroll_contract_versions)과 따로 둔다 — 금액 · 시간 계약이 바뀌지 않아도 재계약일만 바뀔 수 있다.
--   새 판을 넣으면 앞 판은 active=false. 덧붙이기만 한다.
--
-- 되돌리는 방법: drop table public.payroll_check_reviews, public.payroll_contract_terms; (앱 코드를 먼저 예전으로)

create table public.payroll_check_reviews (
  id           uuid primary key default gen_random_uuid(),
  month        text not null check (month ~ '^\d{4}-\d{2}$'),
  employee_id  uuid not null references public.profiles(id),
  item_key     text not null check (char_length(item_key) between 1 and 80),
  decision     text not null check (decision in ('as_is', 'adjust')), -- as_is: 이대로 반영 · adjust: 급여대장에서 이번 달만 조정
  note         text check (note is null or char_length(note) <= 300),
  is_test      boolean not null default true,
  active       boolean not null default true,
  decided_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  released_by  uuid references public.profiles(id),
  released_at  timestamptz
);
create unique index payroll_check_reviews_one on public.payroll_check_reviews (month, employee_id, item_key, is_test) where active;
alter table public.payroll_check_reviews enable row level security;
create policy payroll_check_reviews_select on public.payroll_check_reviews for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete on public.payroll_check_reviews from anon, authenticated;
revoke all on public.payroll_check_reviews from anon;
create trigger payroll_check_reviews_guard before update or delete on public.payroll_check_reviews
  for each row execute function public.guard_columns('active', 'released_by', 'released_at');
create trigger payroll_check_reviews_audit after insert or update on public.payroll_check_reviews
  for each row execute function public.audit_row();

create table public.payroll_contract_terms (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id),
  ends_on      date not null,
  note         text check (note is null or char_length(note) <= 200),
  active       boolean not null default true,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id)
);
create unique index payroll_contract_terms_one on public.payroll_contract_terms (employee_id) where active;
alter table public.payroll_contract_terms enable row level security;
create policy payroll_contract_terms_select on public.payroll_contract_terms for select to authenticated using ((select private.is_admin()));
revoke insert, update, delete on public.payroll_contract_terms from anon, authenticated;
revoke all on public.payroll_contract_terms from anon;
create trigger payroll_contract_terms_guard before update or delete on public.payroll_contract_terms
  for each row execute function public.guard_columns('active', 'updated_by');
create trigger payroll_contract_terms_audit after insert or update on public.payroll_contract_terms
  for each row execute function public.audit_row();
