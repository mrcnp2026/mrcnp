'use client';
// 근무일정 요청 방식 (PRD 35.3 · A17, 2026-10-15) — 관리자 승인 / 직원이 바로 확정. 저장하면 오늘부터 바로 적용된다(이력으로 쌓인다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function ScheduleModeForm({ mode }: { mode: 'approval' | 'direct' }) {
  const t = useTranslations('admin.settings.scheduleMode');
  const router = useRouter();
  const [pick, setPick] = useState(mode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {(['approval', 'direct'] as const).map((m) => (
          <label key={m} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="scheduleMode" value={m} checked={pick === m} onChange={() => { setPick(m); setDone(false); }} className="size-4 accent-primary" />
            {t(m)}
          </label>
        ))}
        <Button type="button" size="sm" disabled={busy || pick === mode} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/settings', { action: 'schedule.mode', mode: pick });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setDone(true);
          router.refresh();
        }}>
          {t('save')}
        </Button>
        {done && <span role="status" className="text-ok">{t('saved')}</span>}
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings.scheduleMode" />}
    </div>
  );
}
