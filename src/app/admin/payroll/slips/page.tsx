// 급여명세서 올리기 (2026-10-16 의뢰인: 명세서는 회사 엑셀을 올리는 방식 — 다운로드 외 업로드 버튼). 급여 담당 관리자만.
// 위: 달 고르기 · 엑셀 올리기(미리보기 → 공개) · 양식 받기 / 아래: 그 달에 공개 중인 명세서와 회수 · 지난 판.
// 메일 발송(2026-10-19): 공개 중인 명세서를 직원 이메일로 — 안 보낸 사람 한꺼번에 · 한 사람씩, 줄마다 발송 여부, 아래에 발송 기록.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ListHead } from '@/components/listframe';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { lastMailBySlip, loadSlipMails, mailReady } from '@/lib/payroll/slip-mail';
import { loadUploads } from '@/lib/payroll/slip-upload-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { SlipMailSend } from './SlipMail';
import { MailLog, MailStatus } from './SlipMailParts';
import { SlipUpload, SlipWithdraw } from './SlipUpload';

const shift = (ym: string, k: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1)).toISOString().slice(0, 7);

export default async function PaySlipsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [t, tm, f, me, sp] = await Promise.all([getTranslations('admin.paySlips'), getTranslations('admin.slipMail'), getFormatter(), getMe(), searchParams]);
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return <PageShell><p className="rounded-card bg-warn-tint p-4 text-sm text-warn">{t('forbidden')}</p></PageShell>;
  const today = toKstDate(new Date());
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : shift(today.slice(0, 7), -1); // 기본은 지난달(이번 달 급여일에 지난달 명세서를 올린다)
  const practice = OFFICE.practiceMode;
  const uploads = await loadUploads(m, practice);
  const { data: people } = await createAdminClient().from('profiles').select('id, name, employee_no, email');
  const who = new Map((people ?? []).map((p) => [p.id as string, { name: p.name as string, no: (p.employee_no as string | null) ?? '', email: !!(p.email as string | null)?.trim() }]));
  const live = (uploads ?? []).filter((u) => u.state === 'PUBLISHED').sort((a, b) => (who.get(a.employeeId)?.no ?? '').localeCompare(who.get(b.employeeId)?.no ?? ''));
  const past = (uploads ?? []).filter((u) => u.state !== 'PUBLISHED');
  const mails = uploads ? await loadSlipMails(uploads.map((u) => u.id)) : null; // 표가 없으면 null (묶음 26 적용 전)
  const last = lastMailBySlip(mails ?? []);
  const unsent = live.filter((u) => last.get(u.id)?.result !== 'SENT');
  const ready = mailReady() && mails !== null;
  const names = new Map([...who].map(([id, w]) => [id, w.name]));
  const won = (v: number) => f.number(v);
  const sum = (k: 'pay' | 'deduction' | 'net') => live.reduce((a, u) => a + u[k], 0);

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} />
      {practice && <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t('practice')}</p>}
      <nav className="flex items-center gap-1 self-start rounded-button bg-bg" aria-label={t('month')}>
        <Link href={`?m=${shift(m, -1)}`} aria-label={t('prev')} className="flex size-11 items-center justify-center text-primary">
          <ChevronLeft aria-hidden size={22} strokeWidth={2} />
        </Link>
        <span className="num px-1 text-lg font-bold">{t('monthOf', { m })}</span>
        <Link href={`?m=${shift(m, 1)}`} aria-label={t('next')} className="flex size-11 items-center justify-center text-primary">
          <ChevronRight aria-hidden size={22} strokeWidth={2} />
        </Link>
      </nav>
      {uploads === null ? (
        <p className="rounded-card border border-warn bg-warn-tint p-4 text-sm text-warn">{t('dbPending')}</p>
      ) : (
        <>
          <Card>
            <CardTitle>{t('uploadTitle', { m })}</CardTitle>
            <div className="pt-3">
              <SlipUpload key={m} month={m} payDate={`${shift(m, 1)}-10`} />
            </div>
          </Card>
          <Card id="slip-list">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('listTitle', { n: live.length })}</CardTitle>
              {live.length > 0 && <SlipWithdraw ids={live.map((u) => u.id)} label={t('withdrawAll')} />}
            </div>
            {live.length > 0 && (
              <div className="flex flex-col gap-1 pt-3">
                <SlipMailSend items={unsent.map((u) => ({ employeeId: u.employeeId, slipId: u.id }))} label={tm('sendUnsent', { n: unsent.length })} ready={ready} />
                <p className="text-xs text-faint">{mails === null ? tm('dbPending') : !mailReady() ? tm('notReady') : tm('hint')}</p>
              </div>
            )}
            {live.length === 0 ? (
              <p className="pt-2 text-sm text-faint">{t('listEmpty')}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2">{t('colNo')}</th>
                      <th className="px-2 py-2">{t('colName')}</th>
                      <th className="px-2 py-2 text-right">{t('colPay')}</th>
                      <th className="px-2 py-2 text-right">{t('colDed')}</th>
                      <th className="px-2 py-2 text-right">{t('colNet')}</th>
                      <th className="px-2 py-2">{t('colPayDate')}</th>
                      <th className="px-2 py-2">{t('colAt')}</th>
                      <th className="px-2 py-2">{tm('colMail')}</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {live.map((u) => (
                      <tr key={u.id}>
                        <td className="num px-2 py-2">{who.get(u.employeeId)?.no}</td>
                        <td className="px-2 py-2 font-semibold">
                          {who.get(u.employeeId)?.name}
                          {u.revision > 1 && <Chip tone="info">{t('revision', { n: u.revision })}</Chip>}
                        </td>
                        <td className="num px-2 py-2 text-right">{won(u.pay)}</td>
                        <td className="num px-2 py-2 text-right">{won(u.deduction)}</td>
                        <td className="num px-2 py-2 text-right font-bold">{won(u.net)}</td>
                        <td className="num px-2 py-2">{u.payDate}</td>
                        <td className="num px-2 py-2 text-muted">{f.dateTime(new Date(u.createdAt), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</td>
                        <td className="px-2 py-2">
                          <span className="flex flex-col items-start gap-1">
                            <MailStatus last={last.get(u.id)} hasEmail={who.get(u.employeeId)?.email ?? false} />
                            <SlipMailSend one items={[{ employeeId: u.employeeId, slipId: u.id }]} label={tm(last.has(u.id) ? 'resend' : 'send')} ready={ready} />
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <SlipWithdraw ids={[u.id]} label={t('withdraw')} />
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="px-2 py-2" colSpan={2}>{t('total')}</td>
                      <td className="num px-2 py-2 text-right">{won(sum('pay'))}</td>
                      <td className="num px-2 py-2 text-right">{won(sum('deduction'))}</td>
                      <td className="num px-2 py-2 text-right">{won(sum('net'))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <MailLog mails={mails ?? []} names={names} />
            {past.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="flex min-h-11 cursor-pointer items-center text-muted">{t('pastTitle', { n: past.length })}</summary>
                <ul className="flex flex-col gap-1 pb-2">
                  {past.map((u) => (
                    <li key={u.id} className="num flex flex-wrap gap-x-3 text-muted">
                      <span className="font-semibold text-text">{who.get(u.employeeId)?.name}</span>
                      <span>{t('revision', { n: u.revision })}</span>
                      <span>{won(u.net)}</span>
                      <span>{t(`state.${u.state}`)}</span>
                      {u.withdrawReason && <span>{u.withdrawReason}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
