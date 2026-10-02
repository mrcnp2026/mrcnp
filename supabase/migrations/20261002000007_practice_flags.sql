-- 20261002000007_practice_flags.sql
-- 연장 요청·정정 요청에도 연습 모드 표시 (4-6). 연습 기록에서 생긴 요청이 운영 집계·급여 CSV에 섞이지 않게.
-- 기본값 true(연습). 한 번 정하면 바뀌지 않는다 — guard_columns 허용 목록에 넣지 않으므로 사실 칸으로 고정된다.
--
-- 되돌리는 방법: alter table … drop column is_test (데이터 손실: 연습/운영 구분만 사라짐)

alter table public.overtime_requests add column is_test boolean not null default true;
alter table public.punch_corrections add column is_test boolean not null default true;

-- 연장 요청은 (직원, 근무일)에 하나였는데, 연습 기간 요청과 운영 요청이 같은 날에 생길 수 있다 → 모드별로 하나
alter table public.overtime_requests drop constraint overtime_requests_employee_id_work_date_key;
create unique index overtime_requests_one_per_day on public.overtime_requests (employee_id, work_date, is_test);

-- add_missing 승인 1건 규칙도 모드별로
drop index public.punch_corrections_one_approved_add_missing;
create unique index punch_corrections_one_approved_add_missing
  on public.punch_corrections (employee_id, work_date, kind, is_test)
  where correction_type = 'add_missing' and status = 'approved';
