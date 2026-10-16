-- 20261016000051_email_signup.sql — 묶음 18 (의뢰인 2026-10-16 권한-6: 초대 링크 가입 + 이메일 직접 가입(관리자 승인) 둘 다)
--   1) profiles.email — 로그인 아이디로 쓰는 이메일(선택). 사번 · 휴대폰과 같이 아이디로 쓴다. 소문자로 저장, 겹치지 않는다.
--      (로그인 계정 안쪽 주소는 지금처럼 {사번}@staff.invalid 그대로 — 이 이메일로 메일을 보내지 않는다)
--   2) signup_requests — 이메일로 스스로 가입한 사람의 신청. 관리자가 승인하면 그때 직원(profiles)이 생긴다.
--      거절하면 신청만 「거절」로 남고 로그인 계정은 지운다(직원 기록이 생기기 전이라 지워도 남는 기록이 없다, 4-1).
--      id = 신청할 때 만든 로그인 계정(auth.users)의 id — 승인하면 같은 id로 직원이 생겨 비밀번호를 다시 만들 필요가 없다.
-- 앱 서버(관리자 열쇠)만 읽고 쓴다.
-- 되돌리기: drop table public.signup_requests; alter table public.profiles drop column email;

alter table public.profiles add column email text check (email is null or (char_length(email) <= 254 and email = lower(email) and email like '%_@_%._%'));
create unique index profiles_email_key on public.profiles (email) where email is not null;

create table public.signup_requests (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 50),
  email text not null check (char_length(email) <= 254 and email = lower(email) and email like '%_@_%._%'),
  phone text check (phone is null or char_length(phone) <= 20),
  locale text not null default 'ko' check (locale in ('ko', 'en', 'vi', 'th')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  reason text check (reason is null or char_length(reason) <= 300),
  employee_id uuid references public.profiles(id)
);
-- 같은 이메일로 대기 중인 신청은 하나만
create unique index signup_requests_pending_email on public.signup_requests (email) where status = 'pending';
create index on public.signup_requests (status, requested_at);

alter table public.signup_requests enable row level security;
revoke all on public.signup_requests from anon, authenticated;

create trigger signup_requests_audit after insert or update or delete on public.signup_requests for each row execute function public.audit_row();
