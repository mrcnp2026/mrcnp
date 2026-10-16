'use client';
// 이메일 가입 신청 — 직원 화면 맨 위 (2026-10-16 의뢰인 권한-6). 신청이 있을 때만 보인다.
// [승인]을 누르면 그 줄 아래에 사번(다음 번호를 미리 채움) · 소속 · 입사일 칸이 열리고, 승인하면 바로 직원이 된다(비밀번호는 신청 때 정함).
// [거절]은 사유(선택)를 받는다. 폰: 한 신청이 한 덩어리, 칸은 세로로 — 가로 넘침 없음.
import { Check, MailPlus, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { SignupRequest } from '@/lib/signup';

const input = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-10 lg:text-sm';

export function SignupRequests({ items, groups, suggestNo, today }: { items: SignupRequest[]; groups: { id: string; label: string }[]; suggestNo: string | null; today: string }) {
  const t = useTranslations('admin.signups');
  const f = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; mode: 'approve' | 'reject' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (items.length === 0) return null;

  async function decide(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/signups/${id}`, body);
    setBusy(false);
    if (!r.ok) return setErr(r);
    setOpen(null);
    router.refresh();
  }

  return (
    <section id="signups" className="scroll-mt-20 rounded-card border border-primary bg-bg lg:shadow-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 font-bold">
        <MailPlus aria-hidden size={18} className="text-primary" />
        {t('title', { n: items.length })}
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {items.map((r) => {
          const on = open?.id === r.id ? open.mode : null;
          return (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{r.name}</p>
                  <p className="text-sm break-all text-muted">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                  <p className="num text-xs text-faint">{t('requested', { at: f.dateTime(new Date(r.requestedAt), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}</p>
                </div>
                {!on && (
                  <div className="flex w-full gap-2 lg:w-auto">
                    <button type="button" onClick={() => { setOpen({ id: r.id, mode: 'reject' }); setErr(null); }} className="min-h-11 flex-1 rounded-button border border-border px-4 text-sm font-semibold text-muted lg:min-h-9 lg:flex-none">
                      {t('reject')}
                    </button>
                    <button type="button" onClick={() => { setOpen({ id: r.id, mode: 'approve' }); setErr(null); }} className="min-h-11 flex-1 rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:min-h-9 lg:flex-none">
                      {t('approve')}
                    </button>
                  </div>
                )}
              </div>
              {on === 'approve' && (
                <form
                  className="flex flex-col gap-3 rounded-card bg-surface p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void decide(r.id, { action: 'approve', employeeNo: fd.get('employeeNo'), groupId: fd.get('groupId'), joinedOn: fd.get('joinedOn') });
                  }}
                >
                  <p className="text-sm text-muted">{t('approveNote')}</p>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    <label className="flex flex-col gap-1 text-sm font-bold">
                      {t('employeeNo')}
                      <input name="employeeNo" defaultValue={suggestNo ?? ''} required maxLength={20} autoComplete="off" className={input} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-bold">
                      {t('joinedOn')}
                      <input name="joinedOn" type="date" max={today} className={input} />
                    </label>
                    <label className="col-span-2 flex flex-col gap-1 text-sm font-bold lg:col-span-1">
                      {t('group')}
                      <select name="groupId" defaultValue="" className={input}>
                        <option value="">{t('noGroup')}</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(null)} className="min-h-11 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-semibold lg:flex-none">
                      {t('cancel')}
                    </button>
                    <Button type="submit" disabled={busy} className="flex-1 lg:flex-none">
                      <Check aria-hidden size={18} />
                      {t('approveDo')}
                    </Button>
                  </div>
                </form>
              )}
              {on === 'reject' && (
                <form
                  className="flex flex-col gap-3 rounded-card bg-surface p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void decide(r.id, { action: 'reject', reason: new FormData(e.currentTarget).get('reason') });
                  }}
                >
                  <label className="flex flex-col gap-1 text-sm font-bold">
                    {t('reason')}
                    <input name="reason" maxLength={300} placeholder={t('reasonPh')} className={input} />
                  </label>
                  <p className="text-xs text-faint">{t('rejectNote')}</p>
                  {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.members" />}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(null)} className="min-h-11 flex-1 rounded-button border border-border bg-bg px-4 text-sm font-semibold lg:flex-none">
                      {t('cancel')}
                    </button>
                    <button type="submit" disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-button bg-danger px-4 text-sm font-bold text-on-primary disabled:opacity-50 lg:flex-none">
                      <X aria-hidden size={18} />
                      {t('rejectDo')}
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
