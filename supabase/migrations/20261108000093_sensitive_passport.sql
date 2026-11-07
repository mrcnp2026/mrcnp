-- 민감정보 보관에 여권번호를 더한다 (급여-36, 2026-11-08 의뢰인: 주민번호 · 외국인등록번호 · 여권번호 · 계좌번호를 모은다).
-- 표 · 잠금 · 기록은 20261014000039_payroll_extras.sql 10~12번 그대로. 종류 목록만 넓힌다.
alter table public.payroll_sensitive_records drop constraint payroll_sensitive_records_record_kind_check;
alter table public.payroll_sensitive_records add constraint payroll_sensitive_records_record_kind_check
  check (record_kind in ('RRN', 'FOREIGN_NO', 'PASSPORT', 'BANK'));
