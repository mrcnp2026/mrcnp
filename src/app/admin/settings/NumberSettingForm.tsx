'use client';
// 숫자 설정 하나 — 오늘부터 적용(지난 날짜는 예전 값 그대로 · 설정 판). 2026-10-29 남은 일 9-2: 「보기 전용」이던 값을 회사가 바꾼다.
// 저장은 서버가 검사한다(settings-catalog의 범위). 같은 날 두 번 바꾸면 거절된다(이력 한 줄).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function NumberSettingForm({ k, value, min, max, unit }: { k: 'week.caution_hours' | 'invite.valid_hours' | 'check.early_ignore_min' | 'check.late_ignore_min' | 'check.pattern_min_early' | 'check.break_early_leave_min'; value: number; min: number; max: number; unit: string }) {
  const t = useTranslations('admin.settings.numberSetting');
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= min && n <= max;
  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <div className="flex items-center gap-2">
        <input value={v} onChange={(e) => { setV(e.target.value.replace(/[^\d]/g, '')); setDone(false); }} inputMode="numeric" aria-label={t('aria')} className="num h-9 w-20 rounded-button border border-border bg-bg px-2 text-right" />
        <span className="text-muted">{unit}</span>
        <Button type="button" size="sm" disabled={busy || !ok || n === value} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/settings', { action: 'setting.int', key: k, value: n });
          setBusy(false);
          if (!r.ok) return setErr(r);
          setDone(true);
          router.refresh();
        }}>{t('save')}</Button>
      </div>
      {!ok && v !== '' && <span className="text-xs text-warn">{t('range', { min, max })}</span>}
      {done && <span role="status" className="text-xs text-ok">{t('saved')}</span>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings.scheduleMode" />}
    </div>
  );
}
