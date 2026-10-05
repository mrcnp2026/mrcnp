-- 20261005000014_profiles_updated_by.sql
-- 직원 정보를 고친 사람을 변경 기록에 남긴다. 서버(service_role)가 고치면 auth.uid()가 비어 "누가"가 빠지므로,
-- 서버 API가 이 칸에 고친 관리자를 적고 audit_row()가 그것을 읽는다 (0009: updated_by를 가장 먼저 본다).
--
-- 되돌리는 방법: alter table public.profiles drop column updated_by;  (데이터 손실: 마지막으로 고친 사람 표시만)
alter table public.profiles add column updated_by uuid references public.profiles(id);
