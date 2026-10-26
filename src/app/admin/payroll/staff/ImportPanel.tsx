'use client';
// 사원별 급여 엑셀 올리기 (2026-10-14) — [양식 받기] → 고쳐서 [엑셀 올리기] → 미리보기(틀린 칸은 빨갛게, 바뀐 줄은 「바뀜」) → 적용 시작일 고르고 [바뀐 n명 적용]
// 적용 전에는 아무것도 저장되지 않는다. 적용하면 바뀐 사람만 새 판으로 쌓인다(앞 판은 고치지 않는다).
import { Download, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { HelpTip } from '@/components/Help';
import type { ImportCol, ImportLine } from '@/lib/payroll/staff-import';

const COLS: ImportCol[] = ['employeeNo', 'name', 'payType', 'amount', 'timeBasis', 'monthlyHours', 'annualDivisor'];
type Err = { code: string; requestId?: string };
const TEMPLATE_URL = '/api/admin/payroll/staff/import'; // 파일 내려받기(화면 이동이 아니다)

async function send(file: File, extra: Record<string, string>): Promise<{ ok: true; data: { lines: ImportLine[]; results?: { row: number; ok: boolean; code?: string }[] } } | ({ ok: false } & Err)> {
  const fd = new FormData();
  fd.set('file', file);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  try {
    const r = await fetch('/api/admin/payroll/staff/import', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: j } : { ok: false, code: j.error ?? 'generic', requestId: j.requestId };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export function ImportPanel({ tomorrow, labels }: { tomorrow: string; labels: Record<string, string> }) {
  const t = useTranslations('admin.staffPay');
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<ImportLine[] | null>(null);
  const [results, setResults] = useState<Map<number, { ok: boolean; code?: string }> | null>(null);
  const [validFrom, setValidFrom] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const bad = lines?.filter((l) => Object.keys(l.errors).length > 0).length ?? 0;
  const changed = lines?.filter((l) => l.changed).length ?? 0;

  const preview = async (f: File) => {
    setBusy(true);
    setErr(null);
    setResults(null);
    const r = await send(f, {});
    setBusy(false);
    if (!r.ok) return setErr(r);
    setFile(f);
    setLines(r.data.lines);
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center font-bold">
          {t('imp.title')}
          <HelpTip>{t('imp.help')}</HelpTip>
        </h2>
        <a href={TEMPLATE_URL} className="ml-auto inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold text-text hover:bg-surface">
          <Download aria-hidden size={16} />
          {t('imp.template')}
        </a>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-button bg-primary px-3.5 text-sm font-semibold text-on-primary disabled:opacity-50">
          <Upload aria-hidden size={16} />
          {t('imp.upload')}
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          aria-label={t('imp.upload')}
          className="hidden"
          data-import-file
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void preview(f);
          }}
        />
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.staffPay" />}
      {lines && (
        <>
          <p className="text-sm">
            {t('imp.summary', { n: lines.length, changed, bad })}
            {bad > 0 && <span className="pl-2 font-semibold text-danger">{t('imp.fixFirst')}</span>}
          </p>
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm" data-import-preview>
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  {COLS.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{labels[c]}</th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-muted">{t('imp.state')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const res = results?.get(l.row);
                  const errs = l.errors;
                  const val = (c: ImportCol) => (c === 'employeeNo' ? l.employeeNo : c === 'name' ? l.name : !l.input ? '' : c === 'payType' ? labels[`pay_${l.input.payType}`] : c === 'timeBasis' ? labels[`basis_${l.input.timeBasis}`] : c === 'amount' ? l.input.amount.toLocaleString() : String(l.input[c] ?? ''));
                  return (
                    <tr key={l.row} className="border-b border-border last:border-b-0">
                      {COLS.map((c) => (
                        <td key={c} className={`px-3 py-2 whitespace-nowrap ${errs[c] ? 'bg-danger-tint font-semibold text-danger' : ''}`}>
                          {errs[c] ? t.has(errs[c]!) ? t(errs[c]!) : t('imp.badCell') : val(c)}
                        </td>
                      ))}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {res ? (res.ok ? <span className="font-bold text-ok">{t('imp.saved')}</span> : <span className="font-bold text-danger">{t.has(res.code ?? '') ? t(res.code!) : t('imp.failed')}</span>) : Object.keys(errs).length ? <span className="font-bold text-danger">{t('imp.error')}</span> : l.changed ? <span className="font-bold text-primary">{t('imp.changed')}</span> : <span className="text-faint">{t('imp.same')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!results && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-muted">
                {t('fValidFrom')}
                <DateTimeInput type="date" value={validFrom} onChange={setValidFrom} required className="num min-h-9 rounded-button border border-border bg-bg px-3 text-sm text-text" />
              </label>
              <button
                type="button"
                disabled={busy || changed === 0 || bad > 0 || !file || !validFrom}
                onClick={async () => {
                  if (!file || !window.confirm(t('imp.confirm', { n: changed, date: validFrom }))) return;
                  setBusy(true);
                  setErr(null);
                  const r = await send(file, { apply: '1', validFrom });
                  setBusy(false);
                  if (!r.ok) return setErr(r);
                  setLines(r.data.lines);
                  setResults(new Map((r.data.results ?? []).map((x) => [x.row, x])));
                  router.refresh();
                }}
                className="inline-flex h-9 items-center rounded-button bg-primary px-3.5 text-sm font-bold text-on-primary disabled:opacity-50"
              >
                {t('imp.apply', { n: changed })}
              </button>
              <p className="text-xs text-faint">{t('imp.applyNote')}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
