-- 20261016000047_payslip_uploads.sql — 묶음 14 (의뢰인 2026-10-16: 급여명세서는 회사 엑셀을 올리는 방식 — 다운로드 외 업로드 버튼)
-- 회사 급여 프로그램에서 나온 명세서 엑셀을 올리면 직원마다 한 장씩 저장되고, 직원의 「내 급여」에 바로 보인다.
-- 앱이 계산하는 급여대장(payroll_runs · payroll_statements)과는 따로 둔다 — 계산 근거가 없는 「받은 명세서」이기 때문.
--   · 한 사람 · 한 달 · (연습/운영)에 「공개 중」은 한 장. 다시 올리면 앞 장은 「바뀜」으로 남고 새 장이 판 번호 +1로 공개된다.
--   · 내용(금액 · 줄)은 고치지 못한다(트리거). 바꿀 수 있는 것은 상태(공개 중 → 바뀜/회수)와 회수 사유뿐. 지우지 못한다.
-- 되돌리기: drop function public.upload_payslips_atomic(uuid, date, date, jsonb, text, text, boolean, uuid); drop table public.payroll_uploaded_slips;

create table public.payroll_uploaded_slips (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  employee_id uuid not null references public.profiles(id),
  pay_month date not null check (extract(day from pay_month) = 1),
  pay_date date not null,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  pay_total numeric(14, 0) not null,
  deduction_total numeric(14, 0) not null,
  net_total numeric(14, 0) not null,
  revision int not null default 1 check (revision >= 1),
  state text not null default 'PUBLISHED' check (state in ('PUBLISHED', 'REPLACED', 'WITHDRAWN')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_hash text,
  is_test boolean not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  withdrawn_by uuid references public.profiles(id),
  withdrawn_at timestamptz,
  withdraw_reason text check (withdraw_reason is null or char_length(withdraw_reason) <= 200),
  check (state <> 'WITHDRAWN' or (withdrawn_by is not null and withdrawn_at is not null and withdraw_reason is not null))
);
create unique index payroll_uploaded_slips_one_live on public.payroll_uploaded_slips (employee_id, pay_month, is_test) where state = 'PUBLISHED';
create index on public.payroll_uploaded_slips (pay_month, is_test);
create index on public.payroll_uploaded_slips (employee_id);

alter table public.payroll_uploaded_slips enable row level security;
revoke all on public.payroll_uploaded_slips from anon, authenticated;

-- 내용은 고정, 상태만 공개 중 → 바뀜/회수
create or replace function public.guard_uploaded_slip()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'payroll_uploaded_slips: delete not allowed'; end if;
  if (to_jsonb(new) - array['state', 'withdrawn_by', 'withdrawn_at', 'withdraw_reason']) is distinct from (to_jsonb(old) - array['state', 'withdrawn_by', 'withdrawn_at', 'withdraw_reason']) then
    raise exception using errcode = '42501', message = 'payroll_uploaded_slips: content is immutable';
  end if;
  if old.state <> 'PUBLISHED' and new.state is distinct from old.state then
    raise exception using errcode = 'P0001', message = 'already';
  end if;
  return new;
end $$;
create trigger payroll_uploaded_slips_guard before update or delete on public.payroll_uploaded_slips
  for each row execute function public.guard_uploaded_slip();

-- 한 번에 올리기(누가 · 언제 · 어떤 파일은 앱이 급여 감사 기록 payroll_audit_events에 남긴다): 같은 달 공개 중인 장은 「바뀜」으로 돌리고 새 장을 판 번호 +1로 넣는다. 중간에 하나라도 실패하면 전부 되돌린다.
-- p_rows: [{ "employee_id": uuid, "lines": [{ "kind": "PAYMENT"|"DEDUCTION", "label": text, "amount": number }], "pay": n, "deduction": n, "net": n }]
create or replace function public.upload_payslips_atomic(p_actor uuid, p_month date, p_pay_date date, p_rows jsonb, p_file_name text, p_file_hash text, p_is_test boolean, p_batch uuid)
returns int language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r jsonb; emp uuid; prev int; n int := 0;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active and can_view_payroll) then
    raise exception using errcode = 'P0001', message = 'payroll_only';
  end if;
  if extract(day from p_month) <> 1 then raise exception using errcode = 'P0001', message = 'invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended('payslip_upload:' || p_month::text, 0));
  for r in select * from jsonb_array_elements(p_rows) loop
    emp := (r ->> 'employee_id')::uuid;
    select coalesce(max(revision), 0) into prev from public.payroll_uploaded_slips where employee_id = emp and pay_month = p_month and is_test = p_is_test;
    update public.payroll_uploaded_slips set state = 'REPLACED' where employee_id = emp and pay_month = p_month and is_test = p_is_test and state = 'PUBLISHED';
    insert into public.payroll_uploaded_slips (batch_id, employee_id, pay_month, pay_date, lines, pay_total, deduction_total, net_total, revision, file_name, file_hash, is_test, uploaded_by)
    values (p_batch, emp, p_month, p_pay_date, r -> 'lines', (r ->> 'pay')::numeric, (r ->> 'deduction')::numeric, (r ->> 'net')::numeric, prev + 1, p_file_name, p_file_hash, p_is_test, p_actor);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.upload_payslips_atomic(uuid, date, date, jsonb, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.upload_payslips_atomic(uuid, date, date, jsonb, text, text, boolean, uuid) to service_role;
