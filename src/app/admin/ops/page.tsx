// 운영 현황 (2026-10-24 의뢰인) — 시스템관리자(사번 admin)만 본다. 최고관리자도 열 수 없고, 메뉴도 시스템관리자에게만 나온다.
// 직원 화면이 아니라 운영하는 사람이 "소비자보다 먼저 아는" 화면: 사이트·DB · 마지막 백업 · 최근 오류 · 외부 연결 · 배포 약속.
// 여기서는 아무것도 저장하지 않는다. 오류 내용은 error-log가 허용한 칸(종류·상태·시간)만 쌓여 있어 개인정보가 없다.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { backupConfigured, listBackups } from '@/lib/backup/github';
import { mailConfigured } from '@/lib/backup/mail';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSystemAdminNo } from '@/lib/system-admin';

export const dynamic = 'force-dynamic';

const STALE_DAYS = 8; // 백업 감시(cron/backup-watch)와 같은 기준

type ErrRow = { id: number; code: string; severity: 'info' | 'warn' | 'error'; route: string | null; occurrences: number; last_seen_at: string; resolved_at: string | null };

export default async function OpsPage() {
  const me = await getMe();
  if (!me || !isSystemAdminNo(me.employeeNo)) notFound(); // 있다는 것 자체를 알리지 않는다
  const [t, f] = await Promise.all([getTranslations('admin.ops'), getFormatter()]);
  const db = createAdminClient();

  // 사이트·DB — /api/health와 같은 질의
  const t0 = performance.now();
  const dbOk = !(await db.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)).error;
  const ms = Math.round(performance.now() - t0);

  // 마지막 백업
  const backupOn = backupConfigured();
  let backupDays: number | null = null;
  let backupDate: string | null = null;
  let backupReadFailed = false;
  if (backupOn) {
    try {
      backupDate = (await listBackups()).at(-1)?.date ?? null;
      if (backupDate) backupDays = Math.round((Date.now() - Date.parse(`${backupDate}T12:00:00+09:00`)) / 86_400_000);
    } catch {
      backupReadFailed = true;
    }
  }
  const backupBad = !backupOn || backupReadFailed || backupDays === null || backupDays > STALE_DAYS;

  // 최근 7일 오류
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: errs, error: errRead } = await db
    .from('app_errors')
    .select('id, code, severity, route, occurrences, last_seen_at, resolved_at')
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(30);
  const rows = (errs ?? []) as ErrRow[];
  const openErrors = rows.filter((r) => !r.resolved_at && r.severity === 'error').length;

  // 외부 연결 — 값이 들어 있는지만 본다 (값 자체는 절대 보이지 않는다)
  const links: { k: string; on: boolean }[] = [
    { k: 'cron', on: !!process.env.CRON_SECRET },
    { k: 'mail', on: mailConfigured() },
    { k: 'backupRepo', on: backupOn },
    { k: 'push', on: !!process.env.VAPID_PRIVATE_KEY && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY },
    { k: 'translate', on: !!process.env.GEMINI_API_KEY },
  ];
  const offLinks = links.filter((l) => !l.on).length;

  const problems = (dbOk ? 0 : 1) + (backupBad ? 1 : 0) + openErrors + (errRead ? 1 : 0);
  const when = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' });
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const tone = { error: 'danger', warn: 'warn', info: 'neutral' } as const;

  return (
    <PageShell wide>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="px-1 text-sm text-muted">{t('only')}</p>

      <div className={`rounded-card p-4 text-sm font-bold ${problems === 0 ? 'bg-ok-tint text-ok' : 'bg-danger-tint text-danger'}`} data-ops-state={problems === 0 ? 'ok' : 'check'}>
        {problems === 0 ? t('allGood') : t('needCheck', { n: problems })}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { k: 'site', v: dbOk ? t('siteOk', { ms }) : t('siteDown'), bad: !dbOk },
          { k: 'backup', v: backupDate ? `${day(backupDate)}${backupDays !== null ? ` · ${t('daysAgo', { n: backupDays })}` : ''}` : backupOn ? (backupReadFailed ? t('backupReadFailed') : t('backupNone')) : t('backupOff'), bad: backupBad },
          { k: 'errors', v: errRead ? t('errorsReadFailed') : t('errorsValue', { n: rows.length, open: openErrors }), bad: openErrors > 0 || !!errRead },
          { k: 'version', v: OFFICE.calcVersion, bad: false },
        ].map((x) => (
          <div key={x.k} className={`rounded-card p-3 ${x.bad ? 'bg-danger-tint' : 'bg-bg'}`}>
            <p className="text-xs text-muted">{t(`stat.${x.k}`)}</p>
            <p className={`num pt-1 font-bold ${x.bad ? 'text-danger' : ''}`}>{x.v}</p>
          </div>
        ))}
      </div>

      <Card className="flex flex-col gap-2">
        <CardTitle>{t('errorsTitle')}</CardTitle>
        {rows.length === 0 ? (
          <p className="rounded-card bg-surface p-4 text-sm text-faint">{t('errorsNone')}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Chip tone={r.resolved_at ? 'ok' : tone[r.severity]}>{r.resolved_at ? t('resolved') : r.severity}</Chip>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.code}</span>
                  <span className="block truncate text-xs text-muted">{r.route ?? '-'}</span>
                </span>
                <span className="num text-sm text-muted">{t('times', { n: r.occurrences })}</span>
                <span className="num text-sm text-muted">{when(r.last_seen_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link href="/admin/ops/mail" className="flex min-h-12 items-center justify-between gap-3 rounded-card border border-border bg-bg px-4 py-3 text-sm font-bold text-primary">
        {t('toMail')}
        <span aria-hidden>›</span>
      </Link>

      <Card className="flex flex-col gap-2">
        <CardTitle>{t('linksTitle')}</CardTitle>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.k} className="flex items-center justify-between gap-3 rounded-card bg-surface px-4 py-3">
              <span className="min-w-0 text-sm font-medium">{t(`link.${l.k}`)}</span>
              <Chip tone={l.on ? 'ok' : 'warn'}>{l.on ? t('on') : t('off')}</Chip>
            </li>
          ))}
        </ul>
        {offLinks > 0 && <p className="px-1 text-xs text-muted">{t('linksOffNote')}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('rulesTitle')}</CardTitle>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
          <li>{t('ruleFreeze')}</li>
          <li>{t('ruleRollback')}</li>
          <li>{t('ruleMonitor')}</li>
          <li>{t('ruleCron')}</li>
        </ul>
      </Card>
    </PageShell>
  );
}
