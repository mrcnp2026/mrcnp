'use client';
// 그림 맞추기 창 (2026-11-03 의뢰인: 로고를 올릴 때 편집 · 미리보기 없이 바로 올라갔다 — 다른 플랫폼처럼).
// 고른 그림을 틀 안에 놓고 ① 여백 자동 자르기 ② 틀 비율 고르기 ③ 확대 · 끌어서 위치 맞추기를 한 뒤, 틀 그대로 PNG로 만든다.
// 브라우저 안에서만 그린다(서버로 가는 것은 「저장」을 누른 뒤의 결과 한 장). 틀 밖은 투명 — 바탕색을 고르면 그 색으로 채운다.
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { ICON_BG } from '@/config/theme';

export type CropAspect = { key: string; ratio: number | null }; // null = 자른 그림 그대로의 비율
export type CropResult = { blob: Blob; url: string; width: number; height: number; note: CropNote };
export type CropNote = { srcW: number; srcH: number; ratio: number; opaqueBg: boolean };

/** 사방의 같은 색(왼쪽 위 점) · 투명 여백 찾기 — 서버의 tidyLogo와 같은 생각 */
function contentBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number; opaqueBg: boolean } {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  const bg = [data[0], data[1], data[2], data[3]];
  const isBg = (i: number) => (bg[3] < 16 ? data[i + 3] < 16 : Math.abs(data[i] - bg[0]) <= 10 && Math.abs(data[i + 1] - bg[1]) <= 10 && Math.abs(data[i + 2] - bg[2]) <= 10 && data[i + 3] > 200);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (isBg((y * width + x) * 4)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const white = bg[3] >= 16 && bg[0] > 240 && bg[1] > 240 && bg[2] > 240;
  if (x1 < 0) return { x: 0, y: 0, w: width, h: height, opaqueBg: false };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, opaqueBg: bg[3] >= 16 && !white };
}

export function ImageCropper({ file, aspects, outHeight, background, onDone, onCancel, preview }: {
  file: File;
  aspects: CropAspect[];
  outHeight: number; // 결과 높이(px) — 너비는 비율대로
  background?: string | null; // 틀 밖 바탕(null = 투명)
  onDone: (r: CropResult) => void;
  onCancel: () => void;
  preview?: (url: string | null, note: CropNote | null) => React.ReactNode; // 결과를 실제 자리에 놓아 본 모습
}) {
  const t = useTranslations('common.cropper');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<ReturnType<typeof contentBox> | null>(null);
  const [trim, setTrim] = useState(true);
  const [aspect, setAspect] = useState(aspects[0]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // 틀 크기에 대한 비율(-1..1)
  const [out, setOut] = useState<{ url: string; note: CropNote } | null>(null);
  const [bg, setBg] = useState<string | null>(background ?? null);
  const view = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastBlob = useRef<{ blob: Blob; w: number; h: number } | null>(null); // 「저장」에 넘길 마지막 결과

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setBox(contentBox(i));
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const src = useMemo(() => (img && box ? (trim ? box : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }) : null), [img, box, trim]); // 매번 새로 만들면 결과 그리기가 끝없이 돈다
  const ratio = aspect.ratio ?? (src ? src.w / src.h : 1);

  // 틀(w×h)에 그림을 그린다 — 기본은 틀 안에 꽉 차게 맞춤(contain), 확대 · 이동은 그 위에서
  const paint = useCallback((g: CanvasRenderingContext2D, w: number, h: number) => {
    if (!img || !src) return;
    g.clearRect(0, 0, w, h);
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
    }
    const fit = Math.min(w / src.w, h / src.h) * zoom;
    const dw = src.w * fit, dh = src.h * fit;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, src.x, src.y, src.w, src.h, (w - dw) / 2 + pan.x * w, (h - dh) / 2 + pan.y * h, dw, dh);
  }, [img, src, zoom, pan, bg]);

  // 화면용 틀
  useEffect(() => {
    const c = view.current;
    if (!c || !src) return;
    const W = 480, H = Math.round(W / ratio);
    const fitH = H > 240 ? 240 : H;
    c.width = Math.round(fitH * ratio);
    c.height = fitH;
    paint(c.getContext('2d')!, c.width, c.height);
  }, [paint, ratio, src]);

  // 결과(저장할 그림) — 바뀔 때마다 다시 만든다
  useEffect(() => {
    if (!img || !src || !box) return;
    const h = outHeight, w = Math.round(outHeight * ratio);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h);
    let alive = true;
    c.toBlob((blob) => {
      if (!alive || !blob) return;
      const url = URL.createObjectURL(blob);
      setOut((o) => {
        if (o) URL.revokeObjectURL(o.url);
        return { url, note: { srcW: src.w, srcH: src.h, ratio, opaqueBg: box.opaqueBg } };
      });
      lastBlob.current = { blob, w, h };
    }, 'image/png');
    return () => {
      alive = false;
    };
  }, [paint, img, src, box, ratio, outHeight]);
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, c = view.current;
    if (!d || !c) return;
    const r = c.getBoundingClientRect();
    setPan({ x: d.px + (e.clientX - d.x) / r.width, y: d.py + (e.clientY - d.y) / r.height });
  };

  if (!img || !src) return <p className="text-sm text-muted">{t('loading')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-card border border-border p-3" style={{ backgroundImage: 'repeating-conic-gradient(var(--color-surface) 0 25%, var(--color-bg) 0 50%)', backgroundSize: '16px 16px' }}>
        <canvas
          ref={view}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          className="max-w-full cursor-grab touch-none outline-2 outline-primary outline-dashed active:cursor-grabbing"
          aria-label={t('frame')}
        />
        <p className="text-xs text-faint">{t('dragHint')}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {aspects.length > 1 && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('aspect')}</span>
            <div className="flex flex-wrap gap-1">
              {aspects.map((a) => (
                <button key={a.key} type="button" onClick={() => { setAspect(a); setPan({ x: 0, y: 0 }); }} aria-pressed={a.key === aspect.key} className={`min-h-9 rounded-chip border px-3 text-sm ${a.key === aspect.key ? 'border-primary bg-primary-tint font-semibold text-primary' : 'border-border text-muted'}`}>
                  {t(`aspect_${a.key}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{t('zoom')} <span className="num font-normal text-muted">{Math.round(zoom * 100)}%</span></span>
          <input type="range" min={0.3} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="accent-primary" />
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={trim} onChange={(e) => { setTrim(e.target.checked); setPan({ x: 0, y: 0 }); }} className="size-5 accent-primary" />
          {t('trim')}
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{t('bg')}</span>
          {[null, ICON_BG].map((c) => (
            <button key={c ?? 'none'} type="button" onClick={() => setBg(c)} aria-pressed={bg === c} className={`min-h-9 rounded-chip border px-3 ${bg === c ? 'border-primary bg-primary-tint font-semibold text-primary' : 'border-border text-muted'}`}>
              {t(c ? 'bgWhite' : 'bgNone')}
            </button>
          ))}
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="min-h-9 px-2 text-muted underline">{t('reset')}</button>
        </div>
      </div>
      {preview?.(out?.url ?? null, out?.note ?? null)}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button type="button" disabled={!out} onClick={() => lastBlob.current && out && onDone({ blob: lastBlob.current.blob, url: out.url, width: lastBlob.current.w, height: lastBlob.current.h, note: out.note })}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
