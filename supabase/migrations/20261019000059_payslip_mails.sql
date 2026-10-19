-- 20261019000059_payslip_mails.sql — 묶음 26 (의뢰인 2026-10-19: 급여명세서 메일 발송 + 발송 기록)
-- 공개 중인 명세서(앱이 계산한 대장의 명세서 · 올린 명세서)를 직원 이메일(profiles.email)로 PDF를 붙여 보낸 기록.
--   · 보낼 때마다 한 줄. 보냄(SENT) · 실패(FAILED) · 이메일 없음(NO_EMAIL)을 모두 남긴다 — 「발송 여부」는 그 명세서의 마지막 줄로 본다.
--   · 고치거나 지우지 못한다(트리거). 앱 서버만 읽고 쓴다.
-- 되돌리기: drop table public.payroll_slip_mails; drop function public.guard_slip_mail();

create table public.payroll_slip_mails (
  id bigint generated always as identity primary key,
  slip_kind text not null check (slip_kind in ('CALC', 'UPLOAD')),   -- CALC = payroll_statements, UPLOAD = payroll_uploaded_slips
  slip_id uuid not null,
  employee_id uuid not null references public.profiles(id),
  pay_month date not null check (extract(day from pay_month) = 1),
  revision int not null check (revision >= 1),
  to_email text check (to_email is null or char_length(to_email) <= 320),
  result text not null check (result in ('SENT', 'FAILED', 'NO_EMAIL')),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  request_id uuid,
  is_test boolean not null,
  sent_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((result = 'NO_EMAIL') = (to_email is null))
);
create index on public.payroll_slip_mails (slip_id, id);
create index on public.payroll_slip_mails (employee_id);
create index on public.payroll_slip_mails (pay_month, is_test);

alter table public.payroll_slip_mails enable row level security;
revoke all on public.payroll_slip_mails from anon, authenticated;

create or replace function public.guard_slip_mail()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'payroll_slip_mails: append only';
end $$;
create trigger payroll_slip_mails_guard before update or delete on public.payroll_slip_mails
  for each row execute function public.guard_slip_mail();
