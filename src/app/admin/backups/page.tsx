// 통합설정 › 데이터 보관 › 데이터베이스 백업 (2026-10-18 의뢰인 → 2026-10-25 다시 만듦: 매일 자동 백업 · 지금 백업 · 백업으로 되돌리기).
// 파일은 매일 새벽 2시(한국)와 「지금 백업」을 누를 때 암호화해 운영 DB와 다른 프로젝트의 비공개 저장공간에 올라간다(lib/backup/run.ts).
// 숫자 4자리 잠금 안쪽 화면이다(config/console-paths). 되돌리기 · 내려받기는 시스템관리자만.
import { Archive } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import { Pager, pageOf } from '@/components/Pager';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { canDownloadBackup } from '@/lib/backup/github';
import { backupReady, backupPrefix, listBackups } from '@/lib/backup/run';
import { keepRule, KEEP_DAYS, type StoredBackup } from '@/lib/backup/store';
import { toKstDate } from '@/lib/time';
import { BackupActions, BackupRow } from './BackupActions';

const PAGE = 15;

export default async function BackupsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [t, f, sp, me] = await Promise.all([getTranslations('admin.backups'), getFormatter(), searchParams, getMe()]);
  const mayUse = canDownloadBackup(me);
  const ready = backupReady();
  let all: StoredBackup[] = [];
  let failed = false;
  if (ready) {
    try {
      all = await listBackups();
    } catch {
      failed = true;
    }
  }
  const today = toKstDate(new Date());
  const latest = all[0] ?? null;
  const ageDays = latest ? Math.round((Date.parse(today) - Date.parse(latest.date)) / 86_400_000) : null;
  const stale = ready && !failed && (ageDays === null || ageDays > 2);
  const kept = keepRule(all.map((b) => ({ name: b.name, date: b.date })), today);
  const page = pageOf(all, sp.p, PAGE);
  const mb = (n: number) => f.number(n / 1024 / 1024, { maximumFractionDigits: 1 });
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <PageShell wide>
      <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
        {t('title')}
        {backupPrefix() === 'dev' && <Chip>{t('devChip')}</Chip>}
        <HelpTip>{t('intro')}</HelpTip>
      </h1>

      {!ready ? (
        <div className="rounded-card bg-warn-tint p-4 text-sm text-warn" data-backup-state="off">
          <p className="font-bold">{t('offTitle')}</p>
          <p className="pt-1">{t('offBody')}</p>
        </div>
      ) : failed ? (
        <p className="rounded-card bg-danger-tint p-4 text-sm text-danger" data-backup-state="error">{t('readFailed')}</p>
      ) : (
        <>
          {stale && <p className="rounded-card bg-danger-tint p-4 text-sm font-semibold text-danger" data-backup-state="stale">{latest ? t('staleBody', { n: ageDays ?? 0 }) : t('noneBody')}</p>}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-backup-state="on">
            {[
              { k: 'latest', v: latest ? `${day(latest.date)} ${latest.time}` : t('none') },
              { k: 'count', v: t('count', { n: all.length }) },
              { k: 'schedule', v: t('scheduleValue') },
              { k: 'place', v: t('placeValue') },
            ].map((x) => (
              <Card key={x.k} className="flex flex-col gap-1">
                <p className="text-sm text-muted">{t(`stat.${x.k}`)}</p>
                <p className="num text-lg font-bold">{x.v}</p>
              </Card>
            ))}
          </section>
          {mayUse && <BackupActions />}
        </>
      )}

      {ready && !failed && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-lg font-bold">{t('listTitle')}</h2>
          {all.length === 0 ? (
            <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-bg">
              {page.items.map((b) => {
                const k = kept.get(b.name);
                return (
                  <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Archive aria-hidden size={20} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{day(b.date)} {b.time}</span>
                      <span className="num block text-sm text-muted">{t('size', { mb: mb(b.size) })}</span>
                    </span>
                    <Chip tone={k?.yearly ? 'ok' : 'neutral'}>{k?.yearly ? t('keepYearly') : k?.monthly && !k.recent ? t('keepMonthly') : t('keepRecent', { n: KEEP_DAYS })}</Chip>
                    {mayUse && <BackupRow name={b.name} />}
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={page.page} pages={page.pages} param="p" params={sp} label={t('pages')} />
          <p className="px-1 text-xs text-faint">{t('fileNote')}</p>
          {!mayUse && all.length > 0 && <p className="px-1 text-xs text-muted">{t('onlySystem')}</p>}
        </section>
      )}
    </PageShell>
  );
}
