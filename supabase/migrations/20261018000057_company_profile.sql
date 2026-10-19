-- 20261018000057_company_profile.sql — 묶음 24 (의뢰인 2026-10-18 승인)
-- 회사 정보(회사명 · 로고 · 대표자 · 사업자등록번호 · 주소 · 대표 전화 · 근태 방침). 고칠 때마다 한 줄을 더한다 — 가장 최근 줄이 지금 값.
-- 고치거나 지우지 않는다(이력). 서버(관리자 열쇠)만 읽고 쓴다 — 정책을 두지 않아 일반 로그인으로는 읽을 수 없다.
-- 되돌리기: drop table public.company_profile_versions;

create table public.company_profile_versions (
  id          uuid primary key default gen_random_uuid(),
  value       jsonb not null check (jsonb_typeof(value) = 'object'),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index company_profile_versions_latest on public.company_profile_versions (created_at desc);
alter table public.company_profile_versions enable row level security;
create trigger company_profile_versions_no_update before update or delete on public.company_profile_versions
  for each row execute function public.forbid_change();
