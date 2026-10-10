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

export function PlaceMap({
  lat,
  lng,
  radiusM,
  onPick,
  empty = false,
  labels,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  onPick?: (p: { lat: number; lng: number }) => void;
  empty?: boolean; // 좌표를 아직 안 정했다 — 핀·원을 그리지 않는다
  labels: { zoomIn: string; zoomOut: string; credit: string; map: string };
}) {
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
