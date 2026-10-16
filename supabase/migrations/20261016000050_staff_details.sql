-- 20261016000050_staff_details.sql — 묶음 17 (의뢰인 2026-10-16 승인, 권한-3: 생년월일 · 비상연락망 · 보유 자격증 · 차종/차량번호)
-- 직원 한 명에 한 줄. 개인정보라 직원 표(profiles)에 붙이지 않고 따로 둔다. 앱 서버(관리자 열쇠)만 읽고 쓴다.
-- 직원이 「내 정보」에서 직접 넣고, 관리자도 고칠 수 있다(의뢰인 2026-10-16 ①). 누가 고쳤는지는 updated_by → 변경 기록(audit_row)에 남는다.
--   · id = 그 직원의 profiles.id (변경 기록의 target_id가 직원 id가 되게 id라는 이름을 쓴다)
--   · emergency_contacts: [{ "name", "relation", "phone" }] 최대 2명
--   · certificates: [{ "name", "acquired_on"?, "number"? }] 최대 20개 — 이름만 필수 (자세한 검사는 앱이 한다)
-- 되돌리기: drop table public.staff_details;

create table public.staff_details (
  id uuid primary key references public.profiles(id) on delete cascade,
  birth_date date check (birth_date is null or (birth_date >= '1900-01-01' and birth_date <= current_date)),
  emergency_contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(emergency_contacts) = 'array' and jsonb_array_length(emergency_contacts) <= 2),
  certificates jsonb not null default '[]'::jsonb check (jsonb_typeof(certificates) = 'array' and jsonb_array_length(certificates) <= 20),
  car_model text check (car_model is null or char_length(car_model) <= 50),
  car_number text check (car_number is null or char_length(car_number) <= 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.staff_details enable row level security;
revoke all on public.staff_details from anon, authenticated;

create trigger staff_details_audit after insert or update or delete on public.staff_details for each row execute function public.audit_row();
