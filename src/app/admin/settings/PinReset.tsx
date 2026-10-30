'use client';
// 다른 관리자의 통합설정 비밀번호(숫자 4자리) 지우기 — 잊었을 때. 지우면 그 사람은 다음에 통합설정을 열 때 새로 정한다 (2026-10-30 이름: 「숫자」 → 「비밀번호」) (2026-10-14 DB 묶음 7)
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';

export function PinReset({ employeeId, name }: { employeeId: string; name: string }) {
  const t = useTranslations('admin.settings.access');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(t('pinResetConfirm', { name }))) return;
        setBusy(true);
        const r = await callApi('/api/console/pin', { action: 'reset', employeeId });
        setBusy(false);
        if (r.ok) router.refresh();
      }}
      className="text-sm font-bold text-primary hover:underline disabled:opacity-50"
    >
      {t('pinReset')}
    </button>
  );
}
