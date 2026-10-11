-- 20261011000032_punch_request_location.sql
-- 반경 밖 출근/퇴근 요청에 그 순간의 위치를 남긴다 (의뢰인 2026-10-11: 시프티의 요청 상세처럼 관리자가 지도로 본다,
-- 스샷 `요청 내역 요청사항 클릭 시 우측 팝업 승인거절 요청.png`).
--   · lat, lng : 요청을 낸 순간의 위치(소수 5자리로 줄인 값). 위치를 못 받았거나 동의가 없으면 비어 있다
-- ★ 아직 운영 DB에 적용하지 않는다 — 결정 문서 출퇴근-7.
--   지금 동의 문구는 "사무실 반경 밖의 위치는 저장하지 않는다"이다. 이 칸을 쓰려면 동의 문구를 먼저 바꾸고 직원에게 다시 동의를 받아야 한다.
--   앱은 src/config/office.ts 의 requestLocation 이 켜져 있을 때만 이 칸을 읽고 쓴다(꺼져 있으면 이 칸이 없어도 동작한다).
--
-- 되돌리는 방법: alter table public.punch_requests drop column lat, drop column lng;

alter table public.punch_requests
  add column lat double precision check (lat is null or (lat between -90 and 90)),
  add column lng double precision check (lng is null or (lng between -180 and 180));
