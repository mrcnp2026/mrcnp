'use client';
// 엑셀로 한꺼번에 넣기 — 공통 모양 (2026-10-20 의뢰인: 「기능은 OK, UI/UX가 별로」). 직원 등록 · 출퇴근 · 휴가 · 급여 조정이 같이 쓴다.
// ① 양식 받기 → ② 파일 고르기(누르거나 끌어다 놓기) → ③ 미리보기(넣을 수 있음 / 문제 있음 숫자 + 줄마다 상태) → ④ 넣기 → 결과.
// 서버 길은 화면마다 다르다 — endpoint에 file(+ apply=1)을 보내고, 돌아온 값을 view()로 줄 목록으로 바꾼다.
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Chip } from '@/components/ui';

export type ImportRow = { key: string; title: string; detail?: string; state: 'ready' | 'problem' | 'done' | 'failed' | 'skip'; note?: string }; // skip: 세지 않는 알림 줄(예: 「그대로 n개」)

export function ExcelImport<T>({
  templateHref,
  templateExtra,
  endpoint,
  hint,
  view,
  applyLabel,
  errNamespace,
}: {
  templateHref: string;
  templateExtra?: ReactNode; // 양식 받기 옆에 둘 것(날짜 고르기 등)
  endpoint: string;
  hint: string;
  view: (data: T, applied: boolean) => ImportRow[];
  applyLabel: (n: number) => string;
  errNamespace?: string;
}) {
  const t = useTranslations('excelImport');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const send = async (f: File, apply: boolean) => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', f);
    if (apply) fd.set('apply', '1');
    const r = await fetch(endpoint, { method: 'POST', body: fd });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok || !j) return setErr({ code: j?.error ?? 'generic', requestId: r.headers.get('x-request-id') ?? undefined });
    setRows(view(j as T, apply));
    setApplied(apply);
    if (apply) router.refresh();
  };
  const pick = (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setRows(null);
    setApplied(false);
    void send(f, false); // 고르면 바로 미리보기
  };
  const ready = rows?.filter((r) => r.state === 'ready').length ?? 0;
  const problems = rows?.filter((r) => r.state === 'problem' || r.state === 'failed').length ?? 0;
  const done = rows?.filter((r) => r.state === 'done').length ?? 0;
  const step = (n: number, on: boolean, label: string) => (
    <li className={`flex items-center gap-2 ${on ? 'font-bold text-text' : 'text-faint'}`}>
      <span className={`num flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${on ? 'bg-primary text-on-primary' : 'bg-surface'}`}>{n}</span>
      <span className={on ? '' : 'max-sm:sr-only'}>{label}</span>
    </li>
  );

  return (
    <div className="flex flex-col gap-4 text-sm">
      <ol className="flex flex-wrap gap-x-3 gap-y-2 sm:grid sm:grid-cols-4 sm:gap-2">
        {step(1, !file, t('s1'))}
        {step(2, !file, t('s2'))}
        {step(3, !!rows && !applied, t('s3'))}
        {step(4, applied, t('s4'))}
      </ol>
      <p className="text-faint">{hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        {templateExtra}
        <a href={templateHref} className="inline-flex min-h-11 items-center gap-1.5 rounded-button border border-border bg-bg px-3 font-semibold hover:bg-surface lg:min-h-9">
          <Download aria-hidden size={16} />
          {t('template')}
        </a>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed px-4 py-5 text-center ${drag ? 'border-primary bg-primary-tint' : 'border-border bg-surface hover:border-primary'}`}
      >
        {file ? <FileSpreadsheet aria-hidden size={24} className="text-primary" /> : <Upload aria-hidden size={24} className="text-muted" />}
        <span className="font-semibold">{file ? file.name : t('drop')}</span>
        <span className="text-xs text-faint">{busy ? t('reading') : file ? t('again') : t('dropHint')}</span>
      </button>
      <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      {rows && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {applied ? <Chip tone="ok">{t('doneCount', { n: done })}</Chip> : <Chip tone="ok">{t('readyCount', { n: ready })}</Chip>}
            {problems > 0 && <Chip tone="warn">{t('problemCount', { n: problems })}</Chip>}
            {!applied && problems > 0 && <span className="text-xs text-faint">{t('problemNote')}</span>}
          </div>
          <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-button border border-border">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className={`min-w-0 flex-1 truncate ${r.state === 'skip' ? 'text-faint' : 'font-semibold'}`}>{r.title}</span>
                {r.detail && <span className="num text-muted">{r.detail}</span>}
                {r.state === 'done' && <CheckCircle2 aria-hidden size={16} className="text-ok" />}
                {r.note && <span className={`w-full text-xs ${r.state === 'problem' || r.state === 'failed' ? 'text-warn' : 'text-faint'}`}>{r.note}</span>}
              </li>
            ))}
          </ul>
          {!applied && (
            <div>
              <Button type="button" disabled={busy || !ready || !file} onClick={() => file && send(file, true)}>
                {applyLabel(ready)}
              </Button>
            </div>
          )}
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={errNamespace} />}
    </div>
  );
}
