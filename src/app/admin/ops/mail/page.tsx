// 운영 현황 › 명세서 메일 발송 현황 (2026-10-24 의뢰인) — 시스템관리자(사번 admin)만. 급여 화면에는 메일 단추 · 주소가 없고, 여기서만 본다.
// 그 달에 공개 중인 명세서마다 마지막 발송 결과: 총 몇 건 · 보냄 · 실패 · 이메일 없음 · 생년월일 없음 · 아직 안 보냄, 누구인지, 다시 보내기.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { mailReady } from '@/lib/payroll/slip-mail';
import { mailOverview } from '@/lib/payroll/slip-mail-overview';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSystemAdminNo } from '@/lib/system-admin';
import { toKstDate } from '@/lib/time';
import { ResendMails } from './Resend';

export const dynamic = 'force-dynamic';
const shift = (ym: string, k: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + k, 1)).toISOString().slice(0, 7);
const TONE = { SENT: 'ok', FAILED: 'danger', NO_EMAIL: 'warn', NO_BIRTH: 'warn', NONE: 'neutral' } as const;

export default async function OpsMailPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await getMe();
  if (!me || !isSystemAdminNo(me.employeeNo)) notFound(); // 있다는 것 자체를 알리지 않는다
  const [t, f, sp] = await Promise.all([getTranslations('admin.opsMail'), getFormatter(), searchParams]);
  const today = toKstDate(new Date());
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : shift(today.slice(0, 7), -1); // 기본은 지난달
  const { rows, tableMissing } = await mailOverview(m, OFFICE.practiceMode);
  const { data: people } = await createAdminClient().from('profiles').select('id, name, employee_no, email').in('id', [...new Set(rows.map((r) => r.employeeId))]);
  const who = new Map((people ?? []).map((p) => [p.id as string, { name: p.name as string, no: (p.employee_no as string | null) ?? '', email: ((p.email as string | null) ?? '').trim() }]));
  const n = (k: string) => rows.filter((r) => r.result === k).length;
  const retry = rows.filter((r) => r.result === 'FAILED' || r.result === 'NONE').map((r) => ({ employeeId: r.employeeId, slipId: r.slipId }));
  const problems = rows.filter((r) => r.result !== 'SENT').sort((a, b) => (who.get(a.employeeId)?.no ?? '').localeCompare(who.get(b.employeeId)?.no ?? ''));
  const at = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });

  return (
    <PageShell wide>
      <Link href="/admin/ops" className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">‹ {t('back')}</Link>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="px-1 text-sm text-muted">{t('only')}</p>
      <nav className="flex items-center gap-1 self-start rounded-button bg-bg" aria-label={t('month')}>
        <Link href={`?m=${shift(m, -1)}`} aria-label={t('prev')} className="flex size-11 items-center justify-center text-primary"><ChevronLeft aria-hidden size={22} strokeWidth={2} /></Link>
        <span className="num px-1 text-lg font-bold">{t('monthOf', { m })}</span>
        <Link href={`?m=${shift(m, 1)}`} aria-label={t('next')} className="flex size-11 items-center justify-center text-primary"><ChevronRight aria-hidden size={22} strokeWidth={2} /></Link>
      </nav>
      {!mailReady() && <p className="rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">{t('notReady')}</p>}
      {tableMissing ? (
        <p className="rounded-card border border-warn bg-warn-tint p-4 text-sm text-warn">{t('dbPending')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
            {[
              { k: 'total', v: rows.length, bad: false },
              { k: 'sent', v: n('SENT'), bad: false },
              { k: 'failed', v: n('FAILED'), bad: n('FAILED') > 0 },
              { k: 'none', v: n('NONE'), bad: n('NONE') > 0 },
              { k: 'noEmail', v: n('NO_EMAIL'), bad: n('NO_EMAIL') > 0 },
              { k: 'noBirth', v: n('NO_BIRTH'), bad: n('NO_BIRTH') > 0 },
            ].map((x) => (
              <div key={x.k} className={`rounded-card p-3 ${x.bad ? 'bg-danger-tint' : 'bg-bg'}`}>
                <p className="text-xs text-muted">{t(`stat.${x.k}`)}</p>
                <p className={`num pt-1 text-xl font-bold ${x.bad ? 'text-danger' : ''}`}>{t('count', { n: x.v })}</p>
              </div>
            ))}
          </div>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t('listTitle', { n: problems.length })}</CardTitle>
              <ResendMails items={retry} />
            </div>
            {problems.length === 0 ? (
              <p className="rounded-card bg-surface p-4 text-sm text-faint">{rows.length === 0 ? t('empty') : t('allSent')}</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
                {problems.map((r) => (
                  <li key={r.slipId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <Chip tone={TONE[r.result]}>{t(`result.${r.result}`)}</Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{who.get(r.employeeId)?.name}<span className="num pl-2 text-xs font-normal text-muted">{who.get(r.employeeId)?.no}</span></span>
                      <span className="block break-all text-xs text-muted">{r.toEmail ?? who.get(r.employeeId)?.email ?? ''}{r.errorCode ? ` · ${t('code')} ${r.errorCode}` : ''}</span>
                    </span>
                    {r.at && <span className="num text-sm text-muted">{at(r.at)}</span>}
                    {(r.result === 'FAILED' || r.result === 'NONE') && <ResendMails one items={[{ employeeId: r.employeeId, slipId: r.slipId }]} />}
                    {(r.result === 'NO_EMAIL' || r.result === 'NO_BIRTH') && <span className="text-xs text-muted">{t(`fix.${r.result}`)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </PageShell>
  );
}
