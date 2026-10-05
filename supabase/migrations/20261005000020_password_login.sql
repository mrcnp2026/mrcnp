-- 20261005000020_password_login.sql
-- 로그인 방식 변경 (2026-10-05 의뢰인): 폰 1대에 묶인 패스키 대신 사번(또는 휴대폰 번호) + 비밀번호로 PC·폰 어디서나 로그인한다.
-- 비밀번호 자체는 Supabase Auth가 보관한다 (이 DB의 public 표에는 저장하지 않는다). 여기에는 상태 두 칸과 실패 횟수 표만 둔다.
--
--  password_set_at     : 비밀번호를 마지막으로 정한 시각. null이면 아직 가입 전(또는 관리자가 로그인을 초기화함)
--  sessions_revoked_at : 이 시각보다 먼저 로그인한 세션은 무효 (비밀번호 변경·로그인 초기화 때 다른 기기를 끊는다)
--
-- 되돌리는 방법: drop table public.login_attempts;
--               alter table public.profiles drop column password_set_at, drop column sessions_revoked_at;
--   (데이터 손실: 가입 여부 표시와 로그인 실패 횟수만. 비밀번호·기록에는 영향 없음)

alter table public.profiles
  add column password_set_at     timestamptz,
  add column sessions_revoked_at timestamptz;

-- ─────────────────────────────────────────────
-- 로그인 실패 횟수 — 같은 아이디로 짧은 시간에 여러 번 틀리면 잠깐 막는다 (비밀번호 맞히기 방지).
-- 입력한 아이디 원문은 저장하지 않는다 (지문만) — 아이디 칸에 비밀번호를 잘못 치는 사람이 있다.
-- 하루 지난 줄은 서버가 새 줄을 쓸 때 함께 지운다 (예약 작업을 만들지 않는다, 3장)
-- ─────────────────────────────────────────────
create table public.login_attempts (
  id         bigserial primary key,
  login_key  text not null,
  created_at timestamptz not null default now()
);
create index on public.login_attempts (login_key, created_at desc);

-- 서버만 읽고 쓴다. 브라우저(anon·authenticated)는 읽기조차 못 한다 — 정책을 만들지 않고 권한도 회수
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
revoke all on sequence public.login_attempts_id_seq from anon, authenticated;
