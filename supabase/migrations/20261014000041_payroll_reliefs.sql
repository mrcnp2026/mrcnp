-- DB 변경 묶음 8 (2026-10-14 의뢰인 승인): 사원별 감면 · 지원 (중소기업 취업자 소득세 감면 · 두루누리 사회보험료 지원)
-- 직원별 세무 · 보험 판(payroll_employee_tax_versions)에 칸 하나를 더한다. 옛 판은 {} = 「모름」(「아니오」로 바꾸지 않는다).
-- 형식: { "sme": { state, rate, from, to, note }, "durunuri": { state, pensionRate, employmentRate, from, to, note } }
-- 학자금 상환 기간은 기존 student_loan(jsonb)에 from · to를 더 담는다(표 구조 변경 없음).
alter table public.payroll_employee_tax_versions
  add column if not exists reliefs jsonb not null default '{}'::jsonb;

alter table public.payroll_employee_tax_versions
  add constraint payroll_employee_tax_versions_reliefs_object check (jsonb_typeof(reliefs) = 'object');
