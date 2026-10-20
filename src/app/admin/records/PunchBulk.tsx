'use client';
// 출퇴근 기록 「엑셀로 여러 건」 (2026-10-20 노프로 비교 · 같은 날 의뢰인: 엑셀 일괄 입력은 + 추가 창의 탭으로) — 기록 추가 창의 둘째 탭. 관리자만.
// 날짜를 골라 양식(직원마다 한 줄)을 받고 출근 · 퇴근 시각을 채워 올린다. 관리자 대리 등록과 같은 길이라 사유 · 넣은 사람이 남고, 이미 있는 기록은 덮지 않는다.
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { AddTabs } from '@/components/AddTabs';
import { ExcelImport, type ImportRow } from '@/components/ExcelImport';
import type { PunchLine } from '@/lib/punch-bulk';

type Res = { lines: PunchLine[]; results?: { row: number; in: string | null; out: string | null }[] };

/** 기록 추가 창: 한 건 · 엑셀로 여러 건 */
export function RecordAddTabs({ one, today }: { one: ReactNode; today: string }) {
  const t = useTranslations('admin.records.bulk');
  return <AddTabs one={one} many={<PunchExcel today={today} />} labels={{ one: t('tabOne'), many: t('tabMany'), group: t('tabs') }} />;
}

function PunchExcel({ today }: { today: string }) {
  const t = useTranslations('admin.records.bulk');
  const te = useTranslations('errors');
  const tp = useTranslations('admin.detail');
  const [date, setDate] = useState(today);
  const why = (code: string) => (code === 'ok' ? t('ok') : tp.has(code) ? tp(code) : te.has(code) ? te(code) : t.has(`err.${code}`) ? t(`err.${code}`) : code);
  return (
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
  );
}
