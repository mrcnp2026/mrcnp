// 미기록 배너 (7-8) — 카드 위에 (R-10-1). 배너를 띄웠다고 퇴근 처리하지 않는다 (4-8): 정정 요청으로 안내만.
// 이미 요청을 넣은 날은 "검토 중"으로 바꾸고 버튼을 숨긴다 (요점 5).
import { TriangleAlert } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { MissingPunch } from '@/lib/missing-punch';

export async function MissingBanner({ items }: { items: MissingPunch[] }) {
  if (items.length === 0) return null;
  const t = await getTranslations('home.missing');
  const f = await getFormatter();
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });
  return (
    <section role="status" className="flex flex-col gap-2 rounded-card border border-warn bg-warn-tint p-3 text-warn">
      {[...items].sort((x, y) => (x.workDate < y.workDate ? 1 : -1)).slice(0, 3).map((m) => (
        <div key={`${m.workDate}-${m.kind}`} className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            <TriangleAlert aria-hidden size={18} strokeWidth={1.75} className="shrink-0" />
            {t(m.kind === 'out' ? 'noOut' : 'noIn', { day: day(m.workDate) })}
          </p>
          {m.hasPendingRequest ? (
            <span className="shrink-0 text-xs">{t('reviewing')}</span>
          ) : (
            <Link
              href={`/punch/corrections?date=${m.workDate}&kind=${m.kind}`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-button border border-warn bg-bg px-3 text-sm font-semibold"
            >
              {t('request')}
            </Link>
          )}
        </div>
      ))}
      {items.length > 3 && <p className="text-xs">{t('more', { n: items.length - 3 })}</p>}
    </section>
  );
}
