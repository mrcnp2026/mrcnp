-- 묶음 21 (2026-10-17 의뢰인: 「외근 / 원격근무」 장소는 반경을 무한대로)
--   · office_locations.anywhere: 켜면 반경과 상관없이 어디서 찍어도 이 장소로 확인한다.
--     다른 장소의 반경 안이면 그 장소가 먼저다(이 장소는 마지막 후보). 이 장소를 쓰는 지점의 직원에게만 해당한다.
--   · 반경 칸(radius_m, 30~1000)은 그대로 둔다 — 지도에 그릴 원과 「어디서나」를 끈 뒤의 값.
-- 되돌리기: alter table public.office_locations drop column anywhere;
alter table public.office_locations add column anywhere boolean not null default false;
