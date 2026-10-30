'use client';
// 「이번 달 점검함」 단추 (2026-10-29 남은 일 9-5)
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { Button } from '@/components/ui';

export function ReviewButton() {
  const t = useTranslations('admin.accessLog');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button type="button" size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await callApi('/api/admin/access-review', {});
      setBusy(false);
      if (r.ok) router.refresh();
    }}>{t('reviewDo')}</Button>
  );
}
