-- DB 변경 묶음 11 (2026-10-15 의뢰인 승인): 권한 5단계 — 관리자 안의 구분
--   super = 최고관리자 · ceo = 대표자 (둘 다 모든 승인 · 수정, 본인 것도 · 각 1명) · general = 총괄관리자
--   지점관리자 · 일반직원은 role(manager · employee) 그대로. 관리자가 아니면 이 칸은 무시한다(관리자에서 내려오면 코드가 비운다).
-- 되돌리기: drop index profiles_one_super, profiles_one_ceo; alter table profiles drop column admin_level;
alter table public.profiles add column admin_level text check (admin_level in ('super', 'ceo', 'general'));
create unique index profiles_one_super on public.profiles ((true)) where admin_level = 'super';
create unique index profiles_one_ceo on public.profiles ((true)) where admin_level = 'ceo';
-- 지금 관리자는 총괄관리자로, 지금의 오너(사번 admin)는 대표자로
update public.profiles set admin_level = case when employee_no = 'admin' then 'ceo' else 'general' end where role = 'admin';
