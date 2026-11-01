'use client';
// 증명서 미리보기 — PDF를 그림으로 그려 고정해 보여 준다 (2026-11-01 의뢰인: 「미리보기가 좌우 위아래로 막 움직이는 건 아닌 것 같다」).
// 예전에는 iframe에 PDF를 띄워 폰에서 브라우저 PDF 보기가 이리저리 밀렸다. 이제는 작은 그림 → 누르면 화면 가득 + 위쪽 닫기,
// 화면 가득일 때만 두 손가락 · 두 번 톡 · +/− 단추 · Ctrl+휠로 확대 · 축소하고, 확대했을 때만 끌어서 옮긴다.
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';

const MAX = 4;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/** PDF 주소 → 쪽마다 그림(data URL). 주소가 바뀌면 다시 그리고, 그리는 동안은 앞 그림을 그대로 둔다. */
function usePdfImages(src: string) {
  const [pages, setPages] = useState<string[]>([]);
  const [state, setState] = useState<'load' | 'ok' | 'fail'>('load');
  useEffect(() => {
    let stop = false;
    setState('load');
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const res = await fetch(src, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const task = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) });
        const doc = await task.promise;
        const out: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 2.5 }); // 화면 가득 · 확대해도 글자가 뭉개지지 않게
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          await page.render({ canvas, viewport: vp }).promise;
          out.push(canvas.toDataURL('image/png'));
        }
        await task.destroy();
        if (!stop) { setPages(out); setState('ok'); }
      } catch {
        if (!stop) setState('fail');
      }
    })();
    return () => { stop = true; };
  }, [src]);
  return { pages, state };
}

export function CertPreview({ src, title }: { src: string; title: string }) {
  const t = useTranslations('certificates');
  const { pages, state } = usePdfImages(src);
  const [full, setFull] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => pages.length && setFull(true)}
        aria-label={t('previewOpen')}
        className="group relative flex min-h-96 w-full flex-col items-center gap-2 overflow-hidden rounded-card border border-border bg-surface p-2 md:h-full md:justify-center"
      >
        {pages.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 그린 그림(data URL)이라 next/image가 할 일이 없다
          <img key={i} src={p} alt={i === 0 ? title : ''} draggable={false} className={`w-full max-w-2xl bg-white shadow-sm transition-opacity md:min-h-0 md:w-auto md:max-w-full md:flex-1 md:object-contain ${state === 'load' ? 'opacity-50' : ''}`} />
        ))}
        {state === 'load' && <span role="status" className="absolute inset-0 m-auto h-fit text-sm text-muted">{t('previewLoading')}</span>}
        {state === 'fail' && <span role="alert" className="m-auto text-sm text-warn">{t('previewFail')}</span>}
        {pages.length > 0 && (
          <span aria-hidden className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-text/70 text-bg shadow transition-transform group-hover:scale-105">
            <Maximize2 size={18} />
          </span>
        )}
      </button>
      {full && <FullView pages={pages} title={title} onClose={() => setFull(false)} />}
    </>
  );
}

/** 화면 가득 보기 — 위쪽 닫기, 확대 · 축소, 확대했을 때만 끌어서 옮기기 */
function FullView({ pages, title, onClose }: { pages: string[]; title: string; onClose: () => void }) {
  const t = useTranslations('certificates');
  const box = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const lastTap = useRef(0);

  // 확대한 만큼만 옮길 수 있게 — 그림이 화면 밖으로 사라지지 않는다
  const fit = (s: number, x: number, y: number) => {
    const el = box.current;
    if (!el || s <= 1) return { s: 1, x: 0, y: 0 };
    const mx = (el.clientWidth * (s - 1)) / 2;
    const my = (el.clientHeight * (s - 1)) / 2;
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };
  const zoom = (k: number) => setV((o) => fit(clamp(o.s * k, 1, MAX), o.x * k, o.y * k));

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  // Ctrl+휠(PC 트랙패드 두 손가락 포함)로 확대 · 축소 — passive가 아니어야 화면 전체 확대를 막을 수 있다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
      else setV((o) => fit(o.s, o.x - e.deltaX, o.y - e.deltaY));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit · zoom은 box만 읽는다
  }, []);

  const down = (e: PE) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: v.s };
    } else if (pts.current.size === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) setV((o) => (o.s > 1 ? { s: 1, x: 0, y: 0 } : fit(2.5, 0, 0))); // 두 번 톡
      lastTap.current = now;
    }
  };
  const move = (e: PE) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    if (pts.current.size >= 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      const s = clamp((pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d, 1, MAX);
      setV((o) => fit(s, (o.x * s) / o.s, (o.y * s) / o.s));
    } else if (pts.current.size === 1) {
      setV((o) => fit(o.s, o.x + cur.x - prev.x, o.y + cur.y - prev.y));
    }
  };
  const up = (e: PE) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
  };

  const tool = 'flex size-11 items-center justify-center rounded-button text-white hover:bg-white/15 disabled:opacity-40';
  return (
    <div className="pop-backdrop fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center gap-1 px-2 py-2 text-white" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <h2 className="min-w-0 flex-1 truncate px-2 text-base font-bold">{title}</h2>
        <button type="button" className={tool} onClick={() => zoom(1 / 1.5)} disabled={v.s <= 1} aria-label={t('zoomOut')}><Minus aria-hidden size={20} /></button>
        <span className="num w-12 text-center text-sm">{Math.round(v.s * 100)}%</span>
        <button type="button" className={tool} onClick={() => zoom(1.5)} disabled={v.s >= MAX} aria-label={t('zoomIn')}><Plus aria-hidden size={20} /></button>
        <button type="button" className={tool} onClick={() => setV({ s: 1, x: 0, y: 0 })} disabled={v.s === 1} aria-label={t('zoomReset')}><RotateCcw aria-hidden size={18} /></button>
        <button type="button" className={`${tool} ml-1 bg-white/15`} onClick={onClose} aria-label={t('close')} autoFocus><X aria-hidden size={22} /></button>
      </div>
      <div
        ref={box}
        className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ cursor: v.s > 1 ? 'grab' : 'zoom-in' }}
      >
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-3 p-3 will-change-transform"
          style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, transition: pinch.current || pts.current.size ? 'none' : 'transform 180ms ease-out' }}
        >
          {pages.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 그린 그림
            <img key={i} src={p} alt={i === 0 ? title : ''} draggable={false} className="max-w-full bg-white shadow-lg" style={{ maxHeight: `calc(${100 / pages.length}% - 0.75rem)` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
