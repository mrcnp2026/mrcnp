-- 20261023000072_network_per_place.sql
-- 사무실 인터넷 주소(고정 IP · 와이파이)를 출퇴근 장소에 묶는다 (2026-10-23 의뢰인 승인: 지점마다 와이파이 · IP가 다르다).
--   office_networks.location_id : 이 주소가 속한 출퇴근 장소. 비어 있으면 모든 장소에 쓰이는 옛 공통 주소(2026-10-23 운영 DB: 등록된 주소 0건).
--   직원이 찍을 때는 소속 지점에 연결된 장소의 주소(연결이 없으면 켜진 장소 전체)만 사무실로 인정한다 — 앱이 정한다.
-- 되돌리는 방법: alter table public.office_networks drop column location_id; ⚠️ 장소별 구분이 사라진다.
alter table public.office_networks add column location_id uuid references public.office_locations(id);
create index on public.office_networks (location_id);
