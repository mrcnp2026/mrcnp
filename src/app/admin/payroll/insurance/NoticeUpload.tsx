'use client';
// 공단 고지서 엑셀 · CSV 올리기 (2026-10-20 노프로 비교) — 파일을 읽어 열 이름을 보이고, 「이름 · 근로자 고지액」 열을 고르면 직원을 맞춘다.
// 맞춘 줄만 손으로 넣기와 같은 길(notice.save, fileName)로 저장한다. 공단 양식이 정해지지 않아 열은 담당자가 고른다(처음에는 짐작한 열).
// 모양은 다른 엑셀 창(components/ExcelImport)과 같게 — 단계 표시 · 끌어다 놓는 칸 · 맞춤/문제 숫자 (2026-10-20 의뢰인).
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Chip } from '@/components/ui';
import { matchNotice, type NoticeMapping, type NoticeSheet } from '@/lib/payroll/notice-upload';

const field = 'min-h-11 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
const KINDS = ['NP', 'HI', 'EI', 'IA'] as const;
type Person = { id: string; name: string; employeeNo: string | null };
type Err = { code: string; requestId?: string } | null;

export function NoticeUpload({ people, month, live }: { people: Person[]; month: string; live?: boolean }) {
  const t = useTranslations('admin.insurance.upload');
  const ti = useTranslations('admin.insurance');
  const router = useRouter();
  const [insurer, setInsurer] = useState<(typeof KINDS)[number]>('HI');
  const [mon, setMon] = useState(month);
  const [sheet, setSheet] = useState<NoticeSheet | null>(null);
  const [map, setMap] = useState<NoticeMapping | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState<Err>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const matches = sheet && map ? matchNotice(sheet, map, people) : [];
  const good = matches.filter((m) => !m.problem);
  const pick = (k: keyof NoticeMapping, label: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="font-bold">{label}</span>
      <select value={map?.[k] ?? ''} onChange={(e) => setMap({ ...map!, [k]: e.target.value === '' ? null : Number(e.target.value) })} className={field}>
        <option value="">{t('none')}</option>
        {sheet!.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || t('col', { n: i + 1 })}
          </option>
        ))}
      </select>
    </label>
  );
  const read = async (f: File) => {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('file', f);
    fd.set('insurer', insurer);
    const r = await fetch('/api/admin/payroll/insurance/parse', { method: 'POST', body: fd });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!r.ok || !j) {
      setSheet(null);
      return setErr({ code: j?.error ?? 'generic', requestId: r.headers.get('x-request-id') ?? undefined });
    }
    setSheet(j.sheet);
    setMap(j.guess);
    setFileName(j.fileName);
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await callApi<{ id: string }>('/api/admin/payroll/insurance', { action: 'notice.save', insurer, month: mon, fileName, rows: good.map((m) => ({ employeeId: m.employeeId, employee: m.employee, employer: m.employer ?? '', note: t('rowNote', { n: m.row }) })), ...(live ? { live: true } : {}) });
    setBusy(false);
    if (!r.ok) return setErr(r);
    router.push(`/admin/payroll/insurance/notice/${r.data.id}`);
  };
  const pickFile = (f: File | null | undefined) => {
    if (f) void read(f);
  };
  const step = (n: number, on: boolean, label: string) => (
    <li className={`flex items-center gap-2 ${on ? 'font-bold text-text' : 'text-faint'}`}>
      <span className={`num flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${on ? 'bg-primary text-on-primary' : 'bg-surface'}`}>{n}</span>
      <span className={on ? '' : 'max-sm:sr-only'}>{label}</span>
    </li>
  );
  return (
    <div className="flex flex-col gap-4 text-sm">
      <ol className="flex flex-wrap gap-x-3 gap-y-2 sm:grid sm:grid-cols-4 sm:gap-2">
        {step(1, !sheet, t('s1'))}
        {step(2, !sheet, t('s2'))}
        {step(3, !!sheet, t('s3'))}
        {step(4, !!sheet && good.length > 0, t('s4'))}
      </ol>
      <p className="text-faint">{t('hint')}</p>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-bold">{ti('fInsurer')}</span>
          <select value={insurer} onChange={(e) => { setInsurer(e.target.value as (typeof KINDS)[number]); setSheet(null); setFileName(''); }} className={field}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ti(`insurer.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="font-bold">{ti('fMonth')}</span>
          <input type="month" value={mon} onChange={(e) => setMon(e.target.value)} className={field} />
        </label>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files?.[0]); }}
        className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed px-4 py-5 text-center ${drag ? 'border-primary bg-primary-tint' : 'border-border bg-surface hover:border-primary'}`}
      >
        {sheet ? <FileSpreadsheet aria-hidden size={24} className="text-primary" /> : <Upload aria-hidden size={24} className="text-muted" />}
        <span className="font-semibold">{sheet ? fileName : t('drop')}</span>
        <span className="text-xs text-faint">{busy && !sheet ? t('reading') : sheet ? t('again') : t('dropHint')}</span>
      </button>
      <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
      {sheet && map && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {pick('employeeNo', t('mNo'))}
            {pick('name', t('mName'))}
            {pick('employee', t('mEmployee'))}
            {pick('extra', t('mExtra'))}
            {pick('employer', t('mEmployer'))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="ok">{t('readyCount', { n: good.length })}</Chip>
            {matches.length > good.length && <Chip tone="warn">{t('problemCount', { n: matches.length - good.length })}</Chip>}
          </div>
          <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-button border border-border">
            {matches.map((m) => (
              <li key={m.row} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="num w-8 shrink-0 text-faint">{m.row}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{m.label}</span>
                <span className="num">
                  {m.employee === null ? '' : m.employee.toLocaleString('ko-KR')}
                  {m.employer !== null ? ` / ${m.employer.toLocaleString('ko-KR')}` : ''}
                </span>
                {m.problem && <span className="w-full text-xs text-warn">{t(`problem.${m.problem}`)}</span>}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy || !good.length} onClick={save}>
              {t('save', { n: good.length })}
            </Button>
            {matches.length > good.length && <span className="text-xs text-warn">{t('skipped', { n: matches.length - good.length })}</span>}
          </div>
        </>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.insurance" />}
    </div>
  );
}
