-- 20261020000067_foreign_more.sql — 묶음 32 (의뢰인 2026-10-20 승인: 외국인 칸 더하기)
-- staff_details: 영어 이름(여권 표기) · 체류자격외 활동허가 만료일 · 출입국 방문 예약일 · 숙소. 여권번호는 넣지 않는다(급여-36 뒤).
-- 처음에는 0066과 한 파일로 운영 DB에 들어갔다(같은 내용 — if not exists).
-- 되돌리기: alter table public.staff_details drop column english_name, drop column activity_permit_until, drop column immigration_visit_on, drop column dormitory;

alter table public.staff_details
  add column if not exists english_name text check (english_name is null or char_length(english_name) <= 60),
  add column if not exists activity_permit_until date,
  add column if not exists immigration_visit_on date,
  add column if not exists dormitory text check (dormitory is null or char_length(dormitory) <= 100);
comment on column public.staff_details.english_name is '영어 이름(여권 표기)';
comment on column public.staff_details.activity_permit_until is '체류자격외 활동허가 만료일 — 60 · 30일 전 알림';
comment on column public.staff_details.immigration_visit_on is '출입국 · 외국인청 방문 예약일 — 3일 전 · 당일 알림';
comment on column public.staff_details.dormitory is '숙소(회사 기숙사 등)';
