-- 20261020000069_training.sql — 묶음 33 (의뢰인 2026-10-20 승인: 교육 · 안전교육 기록, 서명 그림은 교육 종류마다 켜고 끄기)
-- 법정 의무교육 · 안전교육(TBM 포함)을 만들고, 대상 직원이 앱에서 본인 로그인으로 확인 · 서명하고, 이수율 · 월별 엑셀로 감사에 대응한다.
--   · training_courses   교육 종류 — 주기 · 시간 · 대상 · 서명 그림 받기. 법 기준은 박아 두지 않고 관리자가 고친다(처음 값은 「확인 필요」)
--   · training_sessions  교육 한 번 — 날짜 · 시각 · 강사 · 장소 · 내용. 지우지 않고 취소 표시
--   · training_attendees 대상 · 서명 — 서명한 뒤에는 고치지 못한다(감사 근거). 서명 전에만 대상에서 뺄 수 있다(removed_at)
--   · training_photos    현장 사진 — 비공개 저장소 training-photos, 서버가 권한을 확인한 뒤 내려 준다
-- 앱 서버만 읽고 쓴다. 고친 기록은 변경 기록(audit_row)에 남는다.
-- 되돌리기: drop table public.training_photos, public.training_attendees, public.training_sessions, public.training_courses;
--          drop function public.guard_training_attendee(); delete from storage.buckets where id = 'training-photos';

create table public.training_courses (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 1 and 60),
  law                text check (law is null or char_length(law) <= 100),                       -- 근거 법
  cycle              text not null check (cycle in ('HALF', 'YEAR', 'HIRE', 'ADHOC', 'DAILY')),  -- 반기 · 1년 · 입사 시 · 수시 · 매일
  hours              numeric(5,2) check (hours is null or (hours > 0 and hours <= 100)),         -- 그 주기에 들어야 하는 시간
  targets            jsonb not null default '{}'::jsonb,                                          -- { jobIds, groupIds, employeeIds } 모두 비면 전 직원
  signature_required boolean not null default false,                                              -- 서명 그림(손가락 서명)까지 받는가
  needs_check        boolean not null default true,                                               -- 시간 · 주기를 노무사가 확인하기 전
  active             boolean not null default true,
  sort               int not null default 0,
  created_by         uuid references public.profiles(id),                                         -- 처음 넣어 둔 종류는 비어 있다
  updated_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.training_courses(id),
  held_on       date not null,
  start_time    time,
  end_time      time check (end_time is null or start_time is null or end_time > start_time),
  instructor    text check (instructor is null or char_length(instructor) <= 60),
  place         text check (place is null or char_length(place) <= 100),
  content       text check (content is null or char_length(content) <= 4000),
  cancelled_at  timestamptz,
  cancelled_by  uuid references public.profiles(id),
  is_test       boolean not null default false,
  created_by    uuid not null references public.profiles(id),
  updated_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((cancelled_at is null) = (cancelled_by is null))
);
create index on public.training_sessions (held_on);
create index on public.training_sessions (course_id);

create table public.training_attendees (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.training_sessions(id),
  employee_id    uuid not null references public.profiles(id),
  signed_at      timestamptz,
  sign_method    text check (sign_method is null or sign_method in ('APP', 'ADMIN')),   -- APP = 본인 로그인 확인 · ADMIN = 관리자가 종이 서명을 옮겨 적음
  signature_svg  text check (signature_svg is null or char_length(signature_svg) <= 30000), -- 손가락 서명 그림(SVG 경로)
  signed_note    text check (signed_note is null or char_length(signed_note) <= 200),
  removed_at     timestamptz,
  removed_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  unique (session_id, employee_id),
  check ((signed_at is null) = (sign_method is null)),
  check ((removed_at is null) = (removed_by is null))
);
create index on public.training_attendees (employee_id);

create table public.training_photos (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.training_sessions(id),
  storage_path  text not null unique check (char_length(storage_path) <= 300),
  file_name     text not null check (char_length(file_name) between 1 and 200),
  size_bytes    int not null check (size_bytes > 0 and size_bytes <= 10485760),
  mime          text not null check (mime in ('image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  uploaded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  removed_by    uuid references public.profiles(id),
  check ((removed_at is null) = (removed_by is null))
);
create index on public.training_photos (session_id);

alter table public.training_courses enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_attendees enable row level security;
alter table public.training_photos enable row level security;
revoke all on public.training_courses, public.training_sessions, public.training_attendees, public.training_photos from anon, authenticated;

-- 지우지 않는다. 바꿀 수 있는 칸만
create trigger training_courses_guard before update or delete on public.training_courses
  for each row execute function public.guard_columns('name', 'law', 'cycle', 'hours', 'targets', 'signature_required', 'needs_check', 'active', 'sort', 'updated_by', 'updated_at');
create trigger training_sessions_guard before update or delete on public.training_sessions
  for each row execute function public.guard_columns('held_on', 'start_time', 'end_time', 'instructor', 'place', 'content', 'cancelled_at', 'cancelled_by', 'updated_by', 'updated_at');
create trigger training_photos_guard before update or delete on public.training_photos
  for each row execute function public.guard_columns('removed_at', 'removed_by');

-- 서명: 한 번 하면 고치지 못한다. 서명 전에는 대상에서 빼거나(removed) 서명할 수 있다. 뺀 사람은 서명하지 못한다
create or replace function public.guard_training_attendee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception using errcode = '42501', message = 'training_attendees: delete not allowed'; end if;
  if new.id is distinct from old.id or new.session_id is distinct from old.session_id or new.employee_id is distinct from old.employee_id or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'training_attendees: identity is immutable';
  end if;
  if old.signed_at is not null and (to_jsonb(new) is distinct from to_jsonb(old)) then
    raise exception using errcode = '42501', message = 'training_attendees: signed rows are immutable';
  end if;
  if old.removed_at is not null and new.signed_at is not null then
    raise exception using errcode = 'P0001', message = 'removed';
  end if;
  return new;
end $$;
create trigger training_attendees_guard before update or delete on public.training_attendees
  for each row execute function public.guard_training_attendee();
revoke all on function public.guard_training_attendee() from public, anon, authenticated;

create trigger training_courses_audit after insert or update on public.training_courses for each row execute function public.audit_row();
create trigger training_sessions_audit after insert or update on public.training_sessions for each row execute function public.audit_row();
create trigger training_attendees_audit after insert or update on public.training_attendees for each row execute function public.audit_row();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-photos', 'training-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- 처음 넣어 두는 교육 종류 (시간 · 주기는 「확인 필요」 — 노무사 확인 뒤 관리자가 고친다)
insert into public.training_courses (name, law, cycle, hours, signature_required, sort) values
  ('산업안전보건 정기교육 (생산 · 현장)', '산업안전보건법 제29조 · 시행규칙 별표4', 'HALF', 12, true, 10),
  ('산업안전보건 정기교육 (사무)', '산업안전보건법 제29조 · 시행규칙 별표4', 'HALF', 6, true, 20),
  ('채용 시 안전보건교육', '산업안전보건법 제29조', 'HIRE', 8, true, 30),
  ('작업내용 변경 · 특별교육', '산업안전보건법 제29조', 'ADHOC', null, true, 40),
  ('TBM (작업 전 안전 점검)', '권장 (의무 아님)', 'DAILY', null, false, 50),
  ('직장 내 성희롱 예방교육', '남녀고용평등법 제13조', 'YEAR', 1, false, 60),
  ('장애인 인식개선교육', '장애인고용촉진법 제5조의2', 'YEAR', 1, false, 70),
  ('개인정보보호교육', '개인정보보호법 제28조', 'YEAR', 1, false, 80),
  ('퇴직연금 교육', '근로자퇴직급여보장법 제32조', 'YEAR', 1, false, 90);
