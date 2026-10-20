'use client';
// 휴가 「엑셀로 넣기」 (2026-10-20 노프로 비교 · 같은 날 의뢰인: 화면이 별로 → 제목 줄 단추 + 가운데 창, 공통 모양 ExcelImport). 최고관리자만.
// 한 줄 = 휴가 한 건. 직권 휴가와 같은 길이라 넣자마자 승인되고, 겹치거나 확정 · 마감된 날은 그 줄만 실패로 알린다.
import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AddSheet, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import type { LeaveLine } from '@/lib/leave-bulk';

type Res = { lines: LeaveLine[]; results?: { row: number; ok: boolean; code?: string; days?: number }[] };

export function LeaveBulk() {
  const t = useTranslations('admin.leaveBulk');
  const te = useTranslations('errors');
  const why = (code: string) => (t.has(`err.${code}`) ? t(`err.${code}`) : te.has(code) ? te(code) : code);
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: 'leave-bulk' }))} className="inline-flex h-8 items-center gap-1 rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
        <FileSpreadsheet aria-hidden size={16} />
        {t('open')}
      </button>
      <AddSheet id="leave-bulk" title={t('title')} modal wide className="hidden">
        <ExcelImport<Res>
          templateHref="/api/admin/leave/bulk"
          endpoint="/api/admin/leave/bulk"
          hint={t('hint')}
          errNamespace="admin.leaveBulk.err"
          applyLabel={(n) => t('apply', { n })}
          view={(d) =>
            d.lines.map((l): ImportRow => {
              const done = d.results?.find((r) => r.row === l.row);
              const title = `${l.name || l.employeeNo} · ${l.typeName}`;
              const detail = `${l.startDate ?? ''}${l.endDate && l.endDate !== l.startDate ? ` ~ ${l.endDate}` : ''}${l.startTime ? ` ${l.startTime}` : ''}`;
              if (l.error) return { key: String(l.row), title, detail, state: 'problem', note: why(l.error) };
              if (!done) return { key: String(l.row), title, detail, state: 'ready' };
              return { key: String(l.row), title, detail, state: done.ok ? 'done' : 'failed', note: done.ok ? t('done', { n: done.days ?? 0 }) : why(done.code ?? 'generic') };
            })
          }
        />
      </AddSheet>
    </>
  );
}
