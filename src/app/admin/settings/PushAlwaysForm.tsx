'use client';
// 관리자 폰 알림을 「항상」 받는 최고관리자 고르기 (2026-10-29 남은 일 9-2) — 예전에는 사번으로 코드에 고정돼 있었다.
// 고른 사람은 끌 수 없고, 나머지는 사람마다 켜고 끈다. 「없음」도 고를 수 있다. 대표자는 목록에 없다(받지 않는다).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Select } from '@/components/Select';
import { Button } from '@/components/ui';

export function PushAlwaysForm({ options, value }: { options: { id: string; name: string }[]; value: string | null }) {
  const t = useTranslations('admin.settings.pushAdmins');
  const router = useRouter();
  const [v, setV] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <div className="flex items-center gap-2">
        <Select value={v} onChange={(e) => setV(e.target.value)} aria-label={t('alwaysPick')} className="h-9 min-w-36 rounded-button border border-border bg-bg px-2 text-sm">
          <option value="">{t('alwaysNone')}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Button type="button" size="sm" disabled={busy || v === (value ?? '')} onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await callApi('/api/admin/switches', { pushAlways: v || null });
          setBusy(false);
          if (!r.ok) return setErr(r);
          router.refresh();
        }}>{t('alwaysSave')}</Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
    </div>
  );
}
