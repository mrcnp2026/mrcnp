'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { Button } from '@/components/ui';

// small: PC 표 · 상세의 작은 버튼
export function ConfirmButton({ id, small = false }: { id: string; small?: boolean }) {
  const t = useTranslations('notices');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      size={small ? 'sm' : 'md'}
      className={small ? 'whitespace-nowrap' : 'w-full'}
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
