-- 20261025000075_org_groups_allow_delete.sql — 조직도: 쓰이지 않는 부서 · 팀은 지울 수 있게 (의뢰인 2026-10-25: 「숨김이 아니라 삭제」)
-- 0013은 조직 그룹의 삭제를 트리거로 막고 「숨기기」만 허용했다. 잘못 만든 팀까지 숨긴 목록에 남는 문제를 풀기 위해 삭제 금지 트리거만 뺀다.
--   · 지울 수 있는 것은 쓰이지 않는 그룹뿐이다: 직원 · 하위 그룹 · 출퇴근 장소 연결 · 지점관리자 범위 · 마감 기록이 남아 있으면 외래키(FK)가 막는다. 서버도 지우기 전에 한 번 더 확인한다.
--   · 지운 기록은 변경 기록(org_groups_audit, audit_row)에 남는다. 전체 비우기(truncate)는 계속 막는다.
-- 되돌리기: create trigger org_groups_no_delete before delete on public.org_groups for each row execute function public.guard_columns();

drop trigger if exists org_groups_no_delete on public.org_groups;
