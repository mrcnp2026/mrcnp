// 더보기 › 공지 — 목록 (상태는 계산: 임시·예약·게시 중·종료·보관, 요점 13) + 확인 현황 (요점 17). 삭제 버튼은 없다.
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, Chip, PageShell } from '@/components/ui';
import { listNoticesForAdmin } from '@/lib/notices';

export default async function NoticesPage() {
  const t = await getTranslations('admin.notices');
  const f = await getFormatter();
  const rows = await listNoticesForAdmin(new Date());
  const current = rows.filter((r) => r.state !== 'archived');
  const archived = rows.filter((r) => r.state === 'archived');
  const tone = { draft: 'neutral', scheduled: 'info', live: 'ok', ended: 'neutral', archived: 'neutral' } as const;

  const item = (r: (typeof rows)[number]) => (
    <li key={r.notice.id}>
      <Link href={`/admin/notices/${r.notice.id}`} className="block">
        <Card className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-semibold break-words">{r.notice.title}</p>
            <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-faint" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={tone[r.state]}>{t(`state.${r.state}`)}</Chip>
            {r.notice.important && <Chip tone="warn">{t('important')}</Chip>}
            <span className={`text-xs ${r.notice.audience === 'all' ? 'text-muted' : 'font-semibold text-warn'}`}>{r.notice.audience === 'all' ? t('audAll') : t('audSelected', { n: r.total })}</span>
            {r.notice.status === 'published' && <span className="num text-sm text-muted">{t('confirmed', { n: r.confirmed, total: r.total })}</span>}
            <span className="num text-xs text-faint">{f.dateTime(r.notice.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </Card>
      </Link>
    </li>
  );

  return (
    <PageShell wide>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <Link href="/admin/notices/new" className="inline-flex min-h-11 items-center gap-1 rounded-button bg-primary px-4 font-semibold text-on-primary">
          <Plus aria-hidden size={18} strokeWidth={1.75} />
          {t('new')}
        </Link>
      </header>
      <dl className="grid grid-cols-4 gap-2 lg:gap-4">
        {(['live', 'scheduled', 'draft'] as const).map((k) => (
          <div key={k} className="flex flex-col gap-1 rounded-card bg-bg p-3 lg:gap-2 lg:p-5">
            <dt className="text-xs text-muted lg:text-sm">{t(`state.${k}`)}</dt>
            <dd className="num text-xl leading-none font-extrabold lg:text-3xl">{current.filter((r) => r.state === k).length}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 rounded-card bg-bg p-3 lg:gap-2 lg:p-5">
          <dt className="text-xs text-muted lg:text-sm">{t('archive')}</dt>
          <dd className="num text-xl leading-none font-extrabold text-faint lg:text-3xl">{archived.length}</dd>
        </div>
      </dl>
      {current.length === 0 && <p className="rounded-card bg-bg p-5 text-muted">{t('empty')}</p>}
      {/* PC: 공지 한 건 = 표 한 줄 (2026-10-06 의뢰인) · 폰: 카드 */}
      {current.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colTitle'), t('colState'), t('colAudience'), t('colStart'), t('colConfirmed')].map((x) => (
                  <th key={x} scope="col" className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {current.map((r) => (
                <tr key={r.notice.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/notices/${r.notice.id}`} className="inline-flex min-h-9 items-center font-semibold break-words text-primary">
                      {r.notice.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      <Chip tone={tone[r.state]}>{t(`state.${r.state}`)}</Chip>
                      {r.notice.important && <Chip tone="warn">{t('important')}</Chip>}
                    </span>
                  </td>
                  {/* 누구에게 보이는지 — 「직원 선택」 공지는 고른 사람에게만 보인다 (2026-10-06 의뢰인: 게시했는데 내 공지 탭에 없었다) */}
                  <td className="px-4 py-3 whitespace-nowrap">{r.notice.audience === 'all' ? t('audAll') : <span className="num font-semibold text-warn">{t('audSelected', { n: r.total })}</span>}</td>
                  <td className="px-4 py-3 num whitespace-nowrap text-muted">{f.dateTime(r.notice.startsAt, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-4 py-3 num text-muted">{r.notice.status === 'published' ? t('confirmed', { n: r.confirmed, total: r.total }) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <ul className="flex flex-col gap-3 lg:hidden">{current.map(item)}</ul>
      {archived.length > 0 && (
        <details className="rounded-card border border-border px-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm text-muted">
            <span>
              {t('archive')} <span className="num">{archived.length}</span>
            </span>
            <ChevronDown aria-hidden size={18} strokeWidth={1.75} />
          </summary>
          <ul className="flex flex-col gap-3 pb-3">{archived.map(item)}</ul>
        </details>
      )}
    </PageShell>
  );
}
