'use client';
// 급여대장 「조정 한꺼번에 넣기」 (2026-10-20 노프로 비교 · 같은 날 의뢰인: 화면이 별로 → 단추 하나 + 가운데 창, 탭 두 개).
// ① 엑셀로: 여러 사람 · 여러 항목(가불 · 정산 · 상여 등) ② 같은 금액 여러 명: 상여 · 성과급. 한 칸 = 한 조정이고, 넣은 뒤 「다시 계산」해야 금액에 반영된다.
// ★ 「급여 명세서」(급여 › 급여 명세서)와 다르다 — 그쪽은 다른 프로그램이 계산을 끝낸 결과를 그대로 공개하고, 여기는 우리 계산에 넣을 조정 값이다.
import { Select } from '@/components/Select';
import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AddSheet, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import { Button } from '@/components/ui';
import type { BulkColumn, BulkLine, BulkMember } from '@/lib/payroll/bulk-adjust';

const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm';
type Res = { lines: BulkLine[]; columns: BulkColumn[]; saved?: number; failed?: { employeeId: string; code: string; error: string }[] };

export function BulkAdjust({ id, columns, members }: { id: string; columns: BulkColumn[]; members: BulkMember[] }) {
  const t = useTranslations('admin.payRuns.bulk');
  const [tab, setTab] = useState<'excel' | 'same'>('excel');
  const sheet = `bulk-adjust-${id}`;
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: sheet }))} className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-button border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface lg:min-h-9">
        <FileSpreadsheet aria-hidden size={16} />
        {t('open')}
      </button>
      <AddSheet id={sheet} title={t('open')} modal wide className="hidden">
        <div className="flex flex-col gap-4">
          <p className="rounded-button bg-surface p-3 text-sm text-muted">{t('notSlips')}</p>
          <div role="tablist" aria-label={t('open')} className="grid grid-cols-2 self-start rounded-button border border-border bg-bg p-0.5 text-sm">
            {(['excel', 'same'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex min-h-11 items-center justify-center rounded-button px-4 lg:min-h-9 ${tab === k ? 'bg-surface font-bold text-text' : 'text-muted'}`}>
                {t(k === 'excel' ? 'excelTitle' : 'sameTitle')}
              </button>
            ))}
          </div>
          {tab === 'excel' ? <ExcelPart id={id} members={members} /> : <SamePart id={id} columns={columns} members={members} />}
        </div>
      </AddSheet>
    </>
  );
}

function ExcelPart({ id, members }: { id: string; members: BulkMember[] }) {
  const t = useTranslations('admin.payRuns.bulk');
  return (
    <ExcelImport<Res>
      templateHref={`/api/admin/payroll/runs/${id}/bulk`}
      endpoint={`/api/admin/payroll/runs/${id}/bulk`}
      hint={t('excelHint')}
      errNamespace="admin.payRuns.err"
      applyLabel={(n) => t('applyPeople', { n })}
      view={(d, applied) => {
        const label = (code: string) => d.columns.find((c) => c.code === code)?.label ?? code;
        return d.lines.map((l): ImportRow => {
          const title = l.name || members.find((m) => m.employeeId === l.employeeId)?.name || l.employeeNo;
          const detail = l.cells.map((c) => `${label(c.code)} ${c.amount.toLocaleString('ko-KR')}`).join(' · ');
          if (l.error) return { key: String(l.row), title, detail, state: 'problem', note: t(`err.${l.error}`) };
          if (!l.cells.length) return { key: String(l.row), title, state: 'problem', note: t('empty') };
          const failed = d.failed?.some((f) => f.employeeId === l.employeeId);
          return { key: String(l.row), title, detail, state: applied ? (failed ? 'failed' : 'done') : 'ready', note: applied && failed ? t('someFailed') : undefined };
        });
      }}
    />
  );
}

function SamePart({ id, columns, members }: { id: string; columns: BulkColumn[]; members: BulkMember[] }) {
  const t = useTranslations('admin.payRuns.bulk');
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(members.map((m) => m.employeeId));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        setMsg(null);
        const r = await callApi<{ saved: number; failed: unknown[] }>(`/api/admin/payroll/runs/${id}/bulk`, { itemCode: f.get('item'), amount: f.get('amount'), reason: f.get('reason'), employeeIds: picked });
        setBusy(false);
        if (!r.ok) return setErr(r);
        setMsg(t('applied', { n: r.data.saved, f: r.data.failed.length }));
        router.refresh();
      }}
    >
      <p className="text-faint">{t('sameHint')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('item')}</span>
          <Select name="item" required className={field} defaultValue={columns.find((c) => c.code === 'BONUS')?.code ?? ''}>
            {columns.map((c) => (
              <option key={c.code} value={c.code}>
                {t(c.kind === 'PAYMENT' ? 'kindPay' : 'kindDed')} · {c.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('amount')}</span>
          <input name="amount" inputMode="numeric" required className={`num ${field}`} autoComplete="off" />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('reasonLabel')}</span>
          <input name="reason" required minLength={2} maxLength={300} placeholder={t('reason')} className={field} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-col gap-2 rounded-button border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold">{t('who', { n: picked.length, all: members.length })}</span>
          <span className="flex gap-3 text-xs">
            <button type="button" className="font-semibold text-primary" onClick={() => setPicked(members.map((m) => m.employeeId))}>{t('all')}</button>
            <button type="button" className="font-semibold text-muted" onClick={() => setPicked([])}>{t('none')}</button>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((m) => (
            <label key={m.employeeId} className="flex min-h-9 items-center gap-2">
              <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(m.employeeId)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.employeeId] : picked.filter((x) => x !== m.employeeId))} />
              <span className="truncate">{m.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <Button type="submit" disabled={busy || !picked.length}>
          {t('sameApply', { n: picked.length })}
        </Button>
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.payRuns.err" />}
    </form>
  );
}
