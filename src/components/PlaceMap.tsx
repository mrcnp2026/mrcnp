'use client';
// 출퇴근 장소 지도 — 가운데 핀 + 반경 원 (의뢰인 2026-10-10: 시프티의 출퇴근 장소 화면처럼).
// 지도 그림은 오픈스트리트맵 타일을 쓴다 (열쇠 없이 바로 쓴다). 카카오 지도 열쇠를 받으면 이 부품만 바꾼다 — 좌표·반경 계산은 lib/geo에 있어 그대로다.
// onPick을 주면 지도를 눌러 핀을 옮긴다 (장소 만들기·고치기). 안 주면 보기만 한다.
// 위치·크기는 계산값이라 style로 준다 (디자인 토큰 대상이 아니다).
import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { latLngOf, metersPerPx, TILE, worldPx } from '@/lib/geo';

const MIN_ZOOM = 12;
const MAX_ZOOM = 19;
const SUB = ['a', 'b', 'c'];

type Props = {
  lat: number;
  lng: number;
  radiusM: number;
  onPick?: (p: { lat: number; lng: number }) => void;
  empty?: boolean; // 좌표를 아직 안 정했다 — 핀·원을 그리지 않는다
  labels: { zoomIn: string; zoomOut: string; credit: string; map: string };
};

// 네이버 지도 열쇠(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)가 있으면 네이버 지도, 없으면 오픈스트리트맵 (2026-10-22 의뢰인: 지도는 네이버로).
const NAVER_KEY = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

export function PlaceMap(props: Props) {
  return NAVER_KEY ? <NaverMap {...props} /> : <OsmMap {...props} />;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- 네이버 지도 스크립트는 타입 없이 window.naver로 온다 */
let naverLoad: Promise<any> | null = null;
function loadNaver(): Promise<any> {
  const w = window as any;
  if (w.naver?.maps) return Promise.resolve(w.naver);
  if (!naverLoad) {
    naverLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_KEY}`;
      s.async = true;
      s.onload = () => resolve(w.naver);
      s.onerror = () => {
        naverLoad = null;
        reject(new Error('naver_map_load'));
      };
      document.head.appendChild(s);
    });
  }
  return naverLoad;
}

function NaverMap({ lat, lng, radiusM, onPick, empty = false, labels }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const obj = useRef<{ map: any; marker: any; circle: any } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    (window as any).navermap_authFailure = () => setFailed(true); // 열쇠 · 등록한 사이트 주소가 안 맞을 때 네이버가 부른다
    loadNaver()
      .then((naver) => {
        if (dead || !box.current) return;
        const center = new naver.maps.LatLng(lat, lng);
        const map = new naver.maps.Map(box.current, { center, zoom: 17, minZoom: 10, maxZoom: 21, zoomControl: true, zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }, scaleControl: false, mapDataControl: false });
        const marker = new naver.maps.Marker({ position: center, map: empty ? null : map });
        // 반경 원의 색은 앱 대표 색(theme.ts)을 읽어 쓴다 — 색 값을 코드에 적으면 테마가 바뀔 때 어긋난다 (2026-10-22)
        const brand = getComputedStyle(document.documentElement).getPropertyValue('--t-color-primary').trim() || 'currentColor';
        const circle = new naver.maps.Circle({ map: empty || radiusM <= 0 ? null : map, center, radius: radiusM, strokeColor: brand, strokeWeight: 2, fillColor: brand, fillOpacity: 0.2 });
        naver.maps.Event.addListener(map, 'click', (e: any) => {
          if (pick.current) pick.current({ lat: Number(e.coord.lat().toFixed(6)), lng: Number(e.coord.lng().toFixed(6)) });
        });
        obj.current = { map, marker, circle };
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      obj.current?.map?.destroy?.();
      obj.current = null;
    };
    // 지도는 한 번만 만들고, 값이 바뀌면 아래 효과가 핀·원만 옮긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const o = obj.current;
    const naver = (window as any).naver;
    if (!o || !naver) return;
    const p = new naver.maps.LatLng(lat, lng);
    o.marker.setPosition(p);
    o.marker.setMap(empty ? null : o.map);
    o.circle.setCenter(p);
    o.circle.setRadius(radiusM);
    o.circle.setMap(empty || radiusM <= 0 ? null : o.map);
    o.map.panTo(p);
  }, [lat, lng, radiusM, empty]);

  // 네이버 지도를 못 불러오면(열쇠 · 사이트 주소 등록 문제) 기본 지도로 대신 보여준다
  if (failed) return <OsmMap lat={lat} lng={lng} radiusM={radiusM} onPick={onPick} empty={empty} labels={labels} />;
  return <div ref={box} role="img" aria-label={labels.map} data-place-map className={`relative h-72 w-full overflow-hidden rounded-card bg-surface ${onPick ? 'cursor-crosshair' : ''}`} />;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function OsmMap({ lat, lng, radiusM, onPick, empty = false, labels }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(17);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = worldPx(lat, lng, zoom);
  const left = c.x - size.w / 2;
  const top = c.y - size.h / 2;
  const max = 2 ** zoom;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  if (size.w > 0) {
    for (let tx = Math.floor(left / TILE); tx * TILE < left + size.w; tx++) {
      for (let ty = Math.floor(top / TILE); ty * TILE < top + size.h; ty++) {
        if (ty < 0 || ty >= max) continue;
        const wx = ((tx % max) + max) % max;
        tiles.push({ key: `${zoom}/${tx}/${ty}`, src: `https://${SUB[(wx + ty) % 3]}.tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
      }
    }
  }
  const r = radiusM / metersPerPx(lat, zoom);

  return (
    <div
      ref={box}
      role="img"
      aria-label={labels.map}
      data-place-map
      className={`relative h-72 w-full overflow-hidden rounded-card bg-surface ${onPick ? 'cursor-crosshair' : ''}`}
      onClick={(e) => {
        if (!onPick) return;
        const b = e.currentTarget.getBoundingClientRect();
        const p = latLngOf(left + (e.clientX - b.left), top + (e.clientY - b.top), zoom);
        onPick({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      }}
    >
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- 지도 타일은 바깥 서버의 256px 그림 그대로 쓴다
        <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ left: t.x, top: t.y }} />
      ))}
      {size.w > 0 && !empty && (
        <>
          <span aria-hidden className="pointer-events-none absolute rounded-full border-2 border-primary bg-primary/20" style={{ left: size.w / 2 - r, top: size.h / 2 - r, width: r * 2, height: r * 2 }} />
          <span aria-hidden className="pointer-events-none absolute size-4 rounded-full border-2 border-bg bg-danger" style={{ left: size.w / 2 - 8, top: size.h / 2 - 8 }} />
        </>
      )}
      <div className="absolute top-2 right-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={labels.zoomIn} disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))} className="flex size-11 items-center justify-center rounded-button border border-border bg-bg disabled:opacity-40">
          <Plus aria-hidden size={20} />
        </button>
        <button type="button" aria-label={labels.zoomOut} disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))} className="flex size-11 items-center justify-center rounded-button border border-border bg-bg disabled:opacity-40">
          <Minus aria-hidden size={20} />
        </button>
      </div>
      <span className="absolute right-1 bottom-1 rounded-chip bg-bg/80 px-1.5 text-xs text-muted">{labels.credit}</span>
    </div>
  );
}
