'use client';
// 회사 기본설정 › 회사 정보 (2026-10-18 의뢰인: 휴일보다 회사 정보가 먼저 — 시프티의 「일반」처럼).
// 글자 칸은 한 번에 저장한다. 로고는 고르면 바로 올라가고, 「원래 로고로」로 되돌린다. 저장할 때마다 이력이 남는다(DB 묶음 24).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export type CompanyValues = { name: string; ceo: string; bizNo: string; address: string; phone: string; policy: string; hasLogo: boolean; logoAt: string | null };

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text lg:min-h-9 lg:text-sm';

export function CompanyForm({ initial }: { initial: CompanyValues }) {
  const t = useTranslations('admin.settings.company');
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof CompanyValues) => (e: { target: { value: string } }) => {
    setSaved(false);
    setV({ ...v, [k]: e.target.value });
  };

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/company', { name: v.name, ceo: v.ceo, bizNo: v.bizNo, address: v.address, phone: v.phone, policy: v.policy });
    setBusy(false);
    if (!r.ok) return setErr(r);
    setSaved(true);
    router.refresh();
  }
  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/company/logo', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) return setErr({ code: ((await res.json().catch(() => ({}))) as { code?: string }).code ?? 'unknown' });
    setV({ ...v, hasLogo: true, logoAt: new Date().toISOString() });
    router.refresh();
  }
  async function reset() {
    setBusy(true);
    const res = await fetch('/api/admin/company/logo', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setErr({ code: 'unknown' });
    setV({ ...v, hasLogo: false, logoAt: new Date().toISOString() });
    router.refresh();
  }

  const row = 'flex flex-col gap-1 text-sm lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-center lg:gap-4';
  return (
    <div className="flex flex-col gap-4 py-4">
      {/* 로고 */}
      <div className={row}>
        <span className="font-semibold">{t('logo')}</span>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-14 min-w-28 items-center justify-center rounded-button border border-border bg-surface px-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/brand/logo?v=${encodeURIComponent(v.logoAt ?? '0')}`} alt={t('logo')} className="h-9 w-auto max-w-48 object-contain" />
            </span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {t('logoPick')}
            </Button>
            {v.hasLogo && (
              <button type="button" disabled={busy} onClick={reset} className="min-h-9 text-sm text-muted underline">
                {t('logoReset')}
              </button>
            )}
          </div>
          <p className="text-xs text-faint">{t('logoNote')}</p>
        </div>
      </div>
      {(['name', 'ceo', 'bizNo', 'phone', 'address'] as const).map((k) => (
        <label key={k} className={row}>
          <span className="font-semibold">
            {t(k)}
            {k === 'name' && <span className="text-danger"> *</span>}
          </span>
          <input value={v[k]} onChange={set(k)} placeholder={t(`${k}Ph`)} inputMode={k === 'bizNo' || k === 'phone' ? 'tel' : undefined} className={field} />
        </label>
      ))}
      <label className={`${row} lg:items-start`}>
        <span className="font-semibold lg:pt-2">{t('policy')}</span>
        <span className="flex flex-col gap-1">
          <textarea value={v.policy} onChange={set('policy')} rows={5} maxLength={2000} placeholder={t('policyPh')} className={`${field} py-2`} />
          <span className="text-xs text-faint">{t('policyNote')}</span>
        </span>
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
      <div className="flex items-center gap-3 lg:pl-44">
        <Button type="button" disabled={busy || !v.name.trim()} onClick={save} className="lg:min-h-9 lg:text-sm">
          {t('save')}
        </Button>
        {saved && <span role="status" className="text-sm text-ok">{t('saved')}</span>}
      </div>
    </div>
  );
}
