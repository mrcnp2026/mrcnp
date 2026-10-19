-- 20261018000055_request_location.sql
-- 묶음 22 (2026-10-18 의뢰인: 휴가를 빼고 외근 · 출장 · 재택 · 정정 요청은 쓰는 순간의 GPS 위치가 있어야 한다, 결정 출퇴근-9)
--   · work_requests.lat, lng       : 외근 · 출장 · 재택 신청을 보낸 순간의 위치(소수 5자리 ≒ 1m)
--   · punch_corrections.lat, lng   : 출퇴근기록 정정 요청을 보낸 순간의 위치
--   위치를 못 받았거나 위치 동의가 없으면 비어 있다(요청은 그대로 보낸다 — 관리자 화면에 「위치 없음」).
--   동의 문구는 같은 날 판을 올렸다(src/config/consent.ts).
-- 되돌리는 방법:
--   alter table public.work_requests drop column lat, drop column lng;
--   alter table public.punch_corrections drop column lat, drop column lng;

alter table public.work_requests
  add column lat double precision check (lat is null or (lat between -90 and 90)),
  add column lng double precision check (lng is null or (lng between -180 and 180));

alter table public.punch_corrections
  add column lat double precision check (lat is null or (lat between -90 and 90)),
  add column lng double precision check (lng is null or (lng between -180 and 180));
