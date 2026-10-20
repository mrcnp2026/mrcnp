'use client';
// 출퇴근 기록 「엑셀로 넣기」 (2026-10-20 노프로 비교 · 같은 날 의뢰인: 화면이 별로 → 제목 줄 단추 + 가운데 창, 공통 모양 ExcelImport).
// 날짜를 골라 양식(직원마다 한 줄)을 받고, 출근 · 퇴근 시각을 채워 올린다. 관리자 대리 등록과 같은 길이라 사유 · 넣은 사람이 남고, 이미 있는 기록은 덮지 않는다.
import { FileSpreadsheet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddSheet, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import type { PunchLine } from '@/lib/punch-bulk';

type Res = { lines: PunchLine[]; results?: { row: number; in: string | null; out: string | null }[] };

export function PunchBulk({ today }: { today: string }) {
  const t = useTranslations('admin.records.bulk');
  const te = useTranslations('errors');
  const tp = useTranslations('admin.detail');
  const [date, setDate] = useState(today);
  const why = (code: string) => (code === 'ok' ? t('ok') : tp.has(code) ? tp(code) : te.has(code) ? te(code) : t.has(`err.${code}`) ? t(`err.${code}`) : code);
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: 'punch-bulk' }))} className="inline-flex min-h-11 items-center gap-1.5 rounded-button border border-border bg-bg px-3 text-sm font-semibold hover:bg-surface lg:min-h-9">
        <FileSpreadsheet aria-hidden size={16} />
        {t('open')}
      </button>
      <AddSheet id="punch-bulk" title={t('title')} modal wide className="hidden">
        <ExcelImport<Res>
          templateHref={`/api/admin/punches/bulk?date=${date}`}
          templateExtra={<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="min-h-11 rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9" aria-label={t('colDate')} />}
          endpoint="/api/admin/punches/bulk"
          hint={t('hint')}
          errNamespace="admin.records.bulk.err"
          applyLabel={(n) => t('apply', { n })}
          view={(d) =>
            d.lines.map((l): ImportRow => {
              const done = d.results?.find((r) => r.row === l.row);
              const detail = `${l.workDate ?? ''} ${l.in ?? '–'} ~ ${l.out ? `${l.nextDay ? t('nextDay') : ''}${l.out}` : '–'}`;
              const title = l.name || l.employeeNo;
              if (l.error) return { key: String(l.row), title, detail, state: 'problem', note: t(`err.${l.error}`) };
              if (!done) return { key: String(l.row), title, detail, state: 'ready' };
              const bad = [done.in, done.out].some((x) => x && x !== 'ok');
              const note = [done.in && t('inResult', { r: why(done.in) }), done.out && t('outResult', { r: why(done.out) })].filter(Boolean).join(' · ');
              return { key: String(l.row), title, detail, state: bad ? 'failed' : 'done', note };
            })
          }
        />
      </AddSheet>
    </>
  );
}
