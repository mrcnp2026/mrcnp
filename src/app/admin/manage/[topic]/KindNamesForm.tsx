'use client';
// 근무일정 유형의 보이는 이름 고치기 (2026-10-25 의뢰인) — 유형 여섯 개와 계산 방식은 그대로, 이름만. 비우면 기본 이름.
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';
import { KIND_NAME_MAX, type RenamableKind } from '@/lib/shift-kind-names';

export type KindRow = { kind: RenamableKind; base: string; shown: string; note: string };

export function KindNamesForm({ rows }: { rows: KindRow[] }) {
  const t = useTranslations('admin.manage.shiftKinds');
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.kind, r.shown])));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const dirty = rows.some((r) => (vals[r.kind] ?? '').trim() !== r.shown);
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.kind} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 lg:w-1/2">
              <p className="flex items-center gap-1.5 font-bold">
                {r.base}
                {r.kind === 'deemed' && <Check aria-hidden size={14} className="text-primary" />}
              </p>
              <p className="text-sm text-muted">{r.note}</p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-muted lg:w-1/2">
              {t('colShown')}
              <input
                value={vals[r.kind] ?? ''}
                onChange={(e) => { setVals((v) => ({ ...v, [r.kind]: e.target.value })); setDone(false); }}
                maxLength={KIND_NAME_MAX}
                placeholder={t('placeholder')}
                className="h-11 rounded-button border border-border bg-bg px-3 text-base text-text outline-none focus:border-primary lg:h-9 lg:text-sm"
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
        <Button type="button" size="sm" disabled={busy || !dirty} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/settings', { action: 'shift.kind_names', names: vals });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setDone(true);
          router.refresh();
        }}>
          {t('save')}
        </Button>
        <span className="text-xs text-faint">{t('hintLimit')}</span>
        {done && <span role="status" className="text-sm text-ok">{t('saved')}</span>}
      </div>
      {err && <div className="px-4 pb-3"><ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage.shiftKinds" /></div>}
    </Card>
  );
}
