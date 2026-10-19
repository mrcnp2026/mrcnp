// 통합설정 › 기록 · 데이터 › 데이터베이스 백업 (2026-10-18 의뢰인: 백업 파일이 보존되고 있는 것을 눈으로 보고, 내려받고, 되살리는 법을 안내).
// 파일은 주간 백업(.github/workflows/backup.yml → scripts/backup.mts)이 비공개 GitHub 저장소 릴리스에 암호화해 올린 것이다.
// 이 화면은 그중 「달마다 한 개」(그달의 첫 백업 — 보관 규칙 lib/backup/retention.ts의 매월 · 매년 보관분)만 최근 것부터 보인다.
// 숫자 4자리 잠금 안쪽 화면이다(config/console-paths). 내려받기는 /api/admin/backups/[id]/download.
import { Archive, Download } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { HelpTip } from '@/components/Help';
import { Pager, pageOf } from '@/components/Pager';
import { Card, CardTitle, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { backupConfigured, canDownloadBackup, listBackups, type BackupRelease } from '@/lib/backup/github';
import { classify, KEEP_MONTHLY } from '@/lib/backup/retention';

const PAGE = 12;

export default async function BackupsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [t, f, sp] = await Promise.all([getTranslations('admin.backups'), getFormatter(), searchParams]);
  const configured = backupConfigured();
  const mayDownload = canDownloadBackup(await getMe()); // 내려받기는 시스템관리자만 (2026-10-18 의뢰인)
  let all: BackupRelease[] = [];
  let failed = false;
  if (configured) {
    try {
      all = await listBackups();
    } catch {
      failed = true;
    }
  }
  const kept = classify(all.map((b) => b.date));
  const monthly = all.filter((b) => kept.get(b.date)?.monthly || kept.get(b.date)?.yearly).reverse(); // 최근 달이 위
  const latest = all.at(-1) ?? null;
  const page = pageOf(monthly, sp.p, PAGE);
  const mb = (n: number) => f.number(n / 1024 / 1024, { maximumFractionDigits: 1 });
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const month = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'long' });

  return (
    <PageShell wide>
      <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
        {t('title')}
        <HelpTip>{t('intro')}</HelpTip>
      </h1>

      {/* 지금 상태 한 줄 — 설정 전 · 읽기 실패 · 마지막 백업 */}
      {!configured ? (
        <div className="rounded-card bg-warn-tint p-4 text-sm text-warn" data-backup-state="off">
          <p className="font-bold">{t('offTitle')}</p>
          <p className="pt-1">{t('offBody')}</p>
        </div>
      ) : failed ? (
        <p className="rounded-card bg-danger-tint p-4 text-sm text-danger" data-backup-state="error">{t('readFailed')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-backup-state="on">
          {[
            { k: 'latest', v: latest ? day(latest.date) : t('none') },
            { k: 'monthlyCount', v: t('count', { n: monthly.length }) },
            { k: 'allCount', v: t('count', { n: all.length }) },
            { k: 'schedule', v: t('scheduleValue') },
          ].map((x) => (
            <div key={x.k} className="rounded-card bg-bg p-3">
              <p className="text-xs text-muted">{t(`stat.${x.k}`)}</p>
              <p className="num pt-1 font-bold">{x.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* 달마다 하나 — 최근 것부터, 한 쪽에 12개 */}
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-lg font-bold">{t('listTitle', { n: KEEP_MONTHLY })}</h2>
        {monthly.length === 0 ? (
          <p className="rounded-card bg-bg p-5 text-sm text-faint">{configured && !failed ? t('empty') : t('emptyOff')}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-bg">
            {page.items.map((b) => {
              const k = kept.get(b.date);
              return (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <Archive aria-hidden size={20} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{month(b.date)}</span>
                    <span className="num block text-sm text-muted">
                      {day(b.date)} · {t('size', { mb: mb(b.size) })}
                    </span>
                  </span>
                  <Chip tone={k?.yearly ? 'ok' : 'neutral'}>{t(k?.yearly ? 'keepYearly' : 'keepMonthly')}</Chip>
                  {mayDownload && <a href={`/api/admin/backups/${b.id}/download`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-button border border-border px-3 text-sm font-semibold text-text hover:bg-surface lg:min-h-9" aria-label={t('downloadOf', { month: month(b.date) })}>
                    <Download aria-hidden size={16} />
                    <span className="hidden sm:inline">{t('download')}</span>
                  </a>}
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={page.page} pages={page.pages} param="p" params={sp} label={t('pages')} />
        <p className="px-1 text-xs text-faint">{t('fileNote')}</p>
        {!mayDownload && monthly.length > 0 && <p className="px-1 text-xs text-muted">{t('onlySystem')}</p>}
      </section>

      {/* 되살리는 법 */}
      <Card className="flex flex-col gap-3">
        <CardTitle>{t('restoreTitle')}</CardTitle>
        <div className="flex flex-col gap-1.5 rounded-button bg-surface p-3 text-sm">
          <p className="font-bold">{t('recentTitle')}</p>
          <p className="text-muted">{t('recentBody')}</p>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="font-bold">{t('fileTitle')}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted">
            {(['s1', 's2', 's3', 's4', 's5'] as const).map((s) => (
              <li key={s}>{t(`step.${s}`)}</li>
            ))}
          </ol>
        </div>
        <p className="rounded-button bg-warn-tint p-3 text-sm text-warn">{t('warn')}</p>
      </Card>
    </PageShell>
  );
}
