-- 묶음 33 (2026-10-22 의뢰인 승인): 프리랜서(청소 직원 등) 지급 — 일용직 지급 대상에 「사업소득 3.3%」와 「지급 기준」을 더한다.
--   ① 세금 방식에 BUSINESS(사업소득 3.3% — 소득세 3% + 지방소득세 0.3%, 4대보험 없음) 추가
--   ② 지급 기준(pay_basis): DAY 일당(기존) · HOUR 시간당 · MONTH 월급 · FIXED 고정 금액(건별). 기존 계약은 모두 DAY 그대로
--   ③ 근무 줄 수량 상한 3 → 744(한 달 시간 수). 기준별 상한(일당 3 · 시간 744 · 월 12 · 건 100)은 앱이 따로 막는다
-- 2026-10-22 운영 DB: 계약 0건 · 근무 줄 0건 — 바뀌는 기존 자료 없음.
alter table public.payroll_payee_engagements drop constraint payroll_payee_engagements_tax_state_check;
alter table public.payroll_payee_engagements add constraint payroll_payee_engagements_tax_state_check check (tax_state in ('UNKNOWN', 'DAILY', 'BUSINESS', 'NONE'));
alter table public.payroll_payee_engagements add column pay_basis text not null default 'DAY' check (pay_basis in ('DAY', 'HOUR', 'MONTH', 'FIXED'));
alter table public.payroll_daily_work drop constraint payroll_daily_work_quantity_check;
alter table public.payroll_daily_work alter column quantity type numeric(6,2);
alter table public.payroll_daily_work add constraint payroll_daily_work_quantity_check check (quantity > 0 and quantity <= 744);
