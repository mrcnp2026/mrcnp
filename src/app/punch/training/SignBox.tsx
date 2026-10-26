'use client';
// 교육 확인 · 서명 (직원, 묶음 33) — 교육 종류에서 서명 그림을 켰으면 손가락으로 서명한 뒤 [확인하고 서명], 아니면 바로 [확인하고 서명].
// 서명 그림은 SVG 경로(M x y L x y …, 600 × 200 칸)로 보낸다. 한 번 서명하면 고치지 못한다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const W = 600, H = 200;

export function SignBox({ sessionId, needDrawing }: { sessionId: string; needDrawing: boolean }) {
  const t = useTranslations('training');
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState([false, false, false, false]);
  const all = checked.every(Boolean);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const point = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return `${Math.round(((e.clientX - r.left) / r.width) * W)} ${Math.round(((e.clientY - r.top) / r.height) * H)}`;
  };
  const strokes = (path.match(/[ML]/g) ?? []).length;
  return (
    <div className="flex flex-col gap-3">
      {needDrawing && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold">{t('drawHere')}</span>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="aspect-[3/1] w-full touch-none rounded-card border-2 border-dashed border-border bg-bg"
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrawing(true); setPath((p) => `${p} M ${point(e)}`.trim()); }}
            onPointerMove={(e) => { if (drawing) setPath((p) => `${p} L ${point(e)}`); }}
            onPointerUp={() => setDrawing(false)}
            onPointerLeave={() => setDrawing(false)}
          >
            <path d={path} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <button type="button" className="self-end text-sm text-muted" onClick={() => setPath('')}>{t('clear')}</button>
        </div>
      )}
      <fieldset className="flex flex-col gap-2 rounded-card bg-surface p-3">
        <legend className="px-1 text-sm font-bold">{t('consentTitle')}</legend>
        {(['c1', 'c2', 'c3', 'c4'] as const).map((k, i) => (
          <label key={k} className="flex min-h-11 items-start gap-3 py-1 text-sm">
            <input type="checkbox" checked={checked[i]} onChange={(e) => setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5 size-5 shrink-0 accent-primary" />
            <span>{t(`consent.${k}`)}</span>
          </label>
        ))}
        <p className="num text-xs text-muted">{t('consentCount', { n: checked.filter(Boolean).length })}</p>
      </fieldset>
      <Button
        type="button"
        disabled={busy || !all || (needDrawing && strokes < 5)}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/training', { sessionId, signature: needDrawing ? path : null, agreed: true });
          setBusy(false);
          if (!r.ok) return setErr(r);
          router.refresh();
        }}
      >
        {t('sign')}
      </Button>
      <p className="text-xs text-faint">{t('signNote')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="training.err" />}
    </div>
  );
}
