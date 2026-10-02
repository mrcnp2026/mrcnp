'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { Button } from '@/components/ui';

export function ConfirmButton({ id }: { id: string }) {
  const t = useTranslations('notices');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      className="w-full"
      onClick={async () => {
        setBusy(true);
        await callApi(`/api/notices/${id}/confirm`, { locale });
        setBusy(false);
        router.refresh();
      }}
    >
      {t('confirm')}
    </Button>
  );
}
