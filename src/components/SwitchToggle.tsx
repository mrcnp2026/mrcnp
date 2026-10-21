'use client';
// 통합설정 스위치 (2026-10-19 의뢰인) — 누르면 바로 저장한다(api/admin/switches). 실패하면 원래대로 돌리고 알린다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';

// pushAdmin: 통합설정 › 알림의 「관리자 폰 알림 받는 사람」 줄 — 회사 스위치 대신 그 관리자의 받기를 켜고 끈다 (2026-10-21, 알림-9)
export function SwitchToggle({ k, on, label, pushAdmin }: { k: string; on: boolean; label: string; pushAdmin?: string }) {
  const t = useTranslations('admin.settings.switch');
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const flip = async () => {
    const next = !value;
    setValue(next);
    setBusy(true);
    setFailed(false);
    const r = await callApi('/api/admin/switches', pushAdmin ? { pushAdmin, on: next } : { key: k, on: next });
    setBusy(false);
    if (!r.ok) {
      setValue(!next);
      setFailed(true);
      return;
    }
    router.refresh();
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={busy} onClick={flip} className="inline-flex min-h-8 items-center gap-2 text-sm font-bold disabled:opacity-60">
        <span className={value ? 'text-ok' : 'text-muted'}>{value ? t('on') : t('off')}</span>
        <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-chip transition-colors duration-150 ${value ? 'bg-primary' : 'bg-border'}`}>
          <span className={`absolute top-0.5 left-0.5 size-5 rounded-chip bg-bg shadow-sm transition-transform duration-150 ${value ? 'translate-x-5' : ''}`} />
        </span>
      </button>
      {failed && <span className="text-xs text-danger">{t('failed')}</span>}
    </span>
  );
}
