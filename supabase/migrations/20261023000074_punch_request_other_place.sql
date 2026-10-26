-- 20261023000074_punch_request_other_place.sql
-- 자기 지점이 아닌 다른 지점 장소(와이파이 · GPS 반경)에서 누른 출근은 일반 출근이 아니라 관리자 승인을 거치는 요청이다 (2026-10-23 의뢰인).
-- 요청의 사유 값에 'other_place'를 더한다. 바뀌는 기존 자료 없음.
-- 되돌리는 방법: 'other_place' 요청이 없을 때만 — 검사를 원래 다섯 값으로 되돌린다.
alter table public.punch_requests drop constraint punch_requests_geo_reason_check;
alter table public.punch_requests add constraint punch_requests_geo_reason_check check (geo_reason in ('outside','no_fix','low_accuracy','no_office','no_consent','other_place'));
