'use client';
// 직원 화면의 근무일정 틀 고르기 (2026-10-19 의뢰인) — 고르고 「저장」. 틀 없음 = 회사 근무규칙(일반 근무).
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';

export function ShiftPick({ employeeId, current, options }: { employeeId: string; current: string; options: { id: string; label: string }[] }) {
  const t = useTranslations('admin.members.workPay');
  const te = useTranslations('errors');
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await callApi(`/api/admin/employees/${employeeId}/shift`, { templateId: value || null });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: te.has(r.code) ? te(r.code) : te('generic') });
    setMsg({ ok: true, text: t('saved') });
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('shift')} className="min-h-11 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 text-sm lg:min-h-9">
          <option value="">{t('shiftNone')}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={save} disabled={busy || value === current} className="min-h-11 shrink-0 rounded-button bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-40 lg:min-h-9">
          {t('save')}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
