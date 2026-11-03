'use client';
// 고르는 설정 하나 — 오늘부터 적용(지난 날짜는 예전 값 그대로 · 설정 판). 저장은 서버가 검사한다(settings-catalog의 선택지).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function ChoiceSettingForm({ k, value, options, labels }: { k: 'pay.late_round'; value: string; options: readonly string[]; labels: Record<string, string> }) {
  const t = useTranslations('admin.settings.numberSetting');
  const router = useRouter();
  const [pick, setPick] = useState(value);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <div className="flex flex-col items-end gap-2 lg:flex-row lg:items-center lg:gap-3">
        {/* 폰: 선택지를 세로로 · PC: 한 줄 */}
        <div role="radiogroup" className="flex flex-col items-start gap-x-3 lg:flex-row">
        {options.map((o) => (
          <label key={o} className="flex min-h-9 items-center gap-2">
            <input type="radio" name={k} value={o} checked={pick === o} onChange={() => { setPick(o); setDone(false); }} className="size-4 accent-primary" />
            {labels[o]}
          </label>
        ))}
        </div>
        <Button type="button" size="sm" disabled={busy || pick === value} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/settings', { action: 'setting.choice', key: k, value: pick });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setDone(true);
          router.refresh();
        }}>{t('save')}</Button>
      </div>
      {done && <span role="status" className="text-xs text-ok">{t('saved')}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings.scheduleMode" />}
    </div>
  );
}
