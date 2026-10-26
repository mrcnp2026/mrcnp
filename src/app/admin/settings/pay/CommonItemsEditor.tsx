'use client';
// 회사 공통 고정 수당 · 공제 (2026-10-25 의뢰인: 직원마다 입력하지 않고 한 번 정하면 전원에게). 사원급여 기본값 화면 안의 한 묶음 —
// 여기서 고친 목록은 아래 [저장]을 눌러야 새 판으로 저장된다. 제외 직원만 고르고, 금액이 다른 사람은 직원 화면에서 같은 항목을 개인 항목으로 넣으면 그 값이 우선한다.
import { Select } from '@/components/Select';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { COMMON_PAY_TYPES, type CommonPayType, type CommonItem } from '@/lib/payroll/common-items';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm text-text';

type Row = { code: string; amount: string; exceptIds: string[]; payTypes: CommonPayType[] }; // payTypes 비어 있으면 전체

export function CommonItemsEditor({ initial, options, people }: { initial: CommonItem[]; options: { code: string; label: string; defaultAmount: number | null }[]; people: { id: string; name: string }[] }) {
  const t = useTranslations('admin.paySettings');
  const [rows, setRows] = useState<Row[]>(initial.map((c) => ({ code: c.code, amount: String(c.amount), exceptIds: c.exceptIds, payTypes: c.payTypes ?? [] })));
  const [pick, setPick] = useState('');
  const label = (code: string) => options.find((o) => o.code === code)?.label ?? code;
  const free = options.filter((o) => !rows.some((r) => r.code === o.code));
  const set = (code: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const json = JSON.stringify(rows.map((r) => ({ code: r.code, amount: r.amount === '' ? NaN : Number(r.amount), exceptIds: r.exceptIds, payTypes: r.payTypes })));
  const target = pick || free[0]?.code || '';
  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="commonItems" value={json} />
      {rows.length === 0 && <p className="text-sm text-faint">{t('s01.commonNone')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.code} className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="min-w-0 flex-1">{label(r.code)}</b>
              <input type="number" min={0} step={1} required value={r.amount} onChange={(e) => set(r.code, { amount: e.target.value })} aria-label={t('s01.commonAmount')} className={`num ${field} max-w-40`} />
              <span className="text-sm text-muted">{t('s01.won')}</span>
              <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.code !== r.code))} aria-label={t('s01.commonRemove')} className="inline-flex size-9 items-center justify-center rounded-button text-muted hover:bg-surface hover:text-danger">
                <Trash2 aria-hidden size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted">{t('s01.typeTitle')}</span>
              {COMMON_PAY_TYPES.map((k) => (
                <label key={k} className="flex min-h-9 items-center gap-1.5">
                  <input type="checkbox" checked={r.payTypes.length === 0 || r.payTypes.includes(k)} onChange={(ev) => {
                    const cur = r.payTypes.length === 0 ? [...COMMON_PAY_TYPES] : r.payTypes;
                    const next = ev.target.checked ? [...cur, k] : cur.filter((x) => x !== k);
                    if (next.length > 0) set(r.code, { payTypes: next.length === COMMON_PAY_TYPES.length ? [] : next }); // 하나는 남겨 둔다
                  }} className="size-4 accent-primary" />
                  {t(`payType.${k}`)}
                </label>
              ))}
            </div>
            <details className="text-sm">
              <summary className="min-h-9 cursor-pointer py-1.5 text-muted">{r.exceptIds.length ? t('s01.exceptCount', { n: r.exceptIds.length }) : t('s01.exceptNone')}</summary>
              <ul className="mt-1 grid max-h-56 gap-x-4 overflow-y-auto sm:grid-cols-2">
                {people.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-9 items-center gap-2">
                      <input type="checkbox" checked={r.exceptIds.includes(p.id)} onChange={(e) => set(r.code, { exceptIds: e.target.checked ? [...r.exceptIds, p.id] : r.exceptIds.filter((x) => x !== p.id) })} className="size-4 accent-primary" />
                      {p.name}
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      {free.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={target} onChange={(e) => setPick(e.target.value)} aria-label={t('s01.commonPick')} className={`${field} max-w-64`}>
            {free.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => { const o = options.find((x) => x.code === target); if (!o) return; setRows((rs) => [...rs, { code: o.code, amount: o.defaultAmount === null ? '' : String(o.defaultAmount), exceptIds: [], payTypes: [] }]); setPick(''); }}>
            {t('s01.commonAdd')}
          </Button>
        </div>
      )}
    </div>
  );
}
