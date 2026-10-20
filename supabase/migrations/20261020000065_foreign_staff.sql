-- 20261020000065_foreign_staff.sql — 묶음 31 (의뢰인 2026-10-20 승인: 외국인 직원 — 태국 · 베트남)
-- 외국인 직원은 국적 · 체류 자격에 따라 국민연금 · 고용보험 · 소득세 · 퇴직금 처리가 다르다.
--   · staff_details: 국적(나라 코드 2자리, 비우면 내국인) · 체류 자격(예: E-9) · 체류 기간 끝 · 국내 첫 근로일(단일세율 19% 특례의 20년 계산)
--   · payroll_retirement_cases: 출국만기보험 받은 금액 — 퇴직 정산 때 「법정 퇴직금 − 보험금」을 회사가 줄 차액으로 보인다
--   외국인등록번호는 넣지 않는다(민감정보 보관 표의 FOREIGN_NO — 결정 사항 급여-36 뒤).
-- 되돌리기:
--   alter table public.staff_details drop column nationality, drop column visa_type, drop column stay_until, drop column first_work_in_korea;
--   alter table public.payroll_retirement_cases drop column departure_insurance_amount;

alter table public.staff_details
  add column nationality text check (nationality is null or nationality ~ '^[A-Z]{2}$'),
  add column visa_type text check (visa_type is null or visa_type ~ '^[A-Z][0-9A-Z-]{0,9}$'),
  add column stay_until date,
  add column first_work_in_korea date check (first_work_in_korea is null or first_work_in_korea >= '1950-01-01');

comment on column public.staff_details.nationality is '국적 나라 코드(ISO 3166-1 alpha-2, 예: TH · VN). 비우면 내국인';
comment on column public.staff_details.visa_type is '체류 자격(예: E-9, H-2, F-2). 외국인만';
comment on column public.staff_details.stay_until is '체류 기간이 끝나는 날 — 60일 · 30일 전 알림';
comment on column public.staff_details.first_work_in_korea is '국내에서 처음 일한 날 — 소득세 단일세율 19% 특례(20년) 계산';

alter table public.payroll_retirement_cases
  add column departure_insurance_amount numeric(18,0) check (departure_insurance_amount is null or departure_insurance_amount >= 0);

comment on column public.payroll_retirement_cases.departure_insurance_amount is 'E-9 출국만기보험 받은 금액(원). 있으면 회사가 줄 차액 = 법정 퇴직금 − 이 금액';
