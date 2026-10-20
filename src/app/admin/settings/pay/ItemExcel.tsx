'use client';
// 지급 · 공제 항목 엑셀 (PRD v1.3 17.3, 2026-10-20 의뢰인: 만들어 줘) — 단추 하나 + 가운데 창. 모양은 다른 엑셀 창(ExcelImport)과 같다.
// 내려받은 파일에 지금 항목이 들어 있다. 고치거나 줄을 더해 올리면 새 항목 · 바뀐 항목만 보이고, 넣으면 항목마다 새 판이 된다.
import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AddSheet, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import type { ItemLine } from '@/lib/payroll/item-sheet';

type Res = { lines: Omit<ItemLine, 'input'>[]; saved?: number; failed?: { row: number; error: string }[] };

export function ItemExcel() {
  const t = useTranslations('admin.paySettings.itemX');
  const id = 'item-excel';
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: id }))} className="inline-flex h-8 items-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface">
        <FileSpreadsheet aria-hidden size={16} />
        {t('open')}
      </button>
      <AddSheet id={id} title={t('open')} modal wide className="hidden">
        <ExcelImport<Res>
          templateHref="/api/admin/payroll/items/excel"
          endpoint="/api/admin/payroll/items/excel"
          hint={t('hint')}
          errNamespace="admin.paySettings.itemX.err"
          applyLabel={(n) => t('apply', { n })}
          view={(d, applied) => {
            const same = d.lines.filter((l) => l.state === 'same').length;
            const rows = d.lines.filter((l) => l.state !== 'same').map((l): ImportRow => {
              const key = String(l.row);
              const title = `${l.name} (${l.code})`;
              if (l.state === 'problem') return { key, title, state: 'problem', note: t(`problem.${l.problem}`, { row: l.row }) };
              const detail = l.state === 'new' ? t('isNew') : t('changed', { list: l.changes.map((c) => t(`col.${c}`)).join(' · ') });
              const fail = d.failed?.find((f) => f.row === l.row);
              return { key, title, detail, state: applied ? (fail ? 'failed' : 'done') : 'ready', note: fail ? t(`err.${fail.error}`) : t('from', { date: l.validFrom ?? '' }) };
            });
            return same ? [...rows, { key: 'same', title: t('same', { n: same }), state: 'skip' }] : rows;
          }}
        />
      </AddSheet>
    </>
  );
}
