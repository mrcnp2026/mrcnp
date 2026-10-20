-- 20261020000068_pension_rename.sql — 퇴직연금 표 이름을 급여 영역 이름으로 (2026-10-20)
-- 0066을 처음 운영 DB에 넣을 때 retirement_pension_* 이름이었다. 금액 칸이 있는 표는 payroll_ 로 시작해야 한다(결정 사항 급여-30 · tests/calc.test.ts).
-- 새로 만드는 DB는 0066이 처음부터 payroll_pension_* 로 만들므로 아무것도 하지 않는다(if exists).
alter table if exists public.retirement_pension_members rename to payroll_pension_members;
alter table if exists public.retirement_pension_contributions rename to payroll_pension_contributions;
