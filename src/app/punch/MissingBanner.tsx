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
  // 화면 법칙 B3 (2026-11-17 의뢰인): 주황은 직원이 할 일 하나로 — 빠진 날마다 줄 · 단추를 쌓지 않고 한 줄 + 단추 하나.
  // 날짜 목록은 정정 화면 맨 위 「정정이 필요한 기록」에 이미 있다. 검토 중인 것만 남으면 기다리면 되는 일이라 회색 한 줄
  const open = items.filter((m) => !m.hasPendingRequest);
  if (open.length === 0) return <p role="status" className="px-1 text-sm text-muted">{t('reviewingN', { n: items.length })}</p>;
  const days = new Set(open.map((m) => m.workDate)).size;
  const one = open.length === 1 ? open[0] : null;
  return (
    // 단추는 글 아래 왼쪽 — 오른쪽 끝이면 폰 홈의 떠 있는 「새 요청」 단추에 가려졌다 (2026-11-06 의뢰인)
    <section role="status" className="flex items-start gap-2 rounded-card border border-warn bg-warn-tint p-3 text-warn">
      <TriangleAlert aria-hidden size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <p className="text-sm">{one ? t(one.kind === 'out' ? 'noOut' : 'noIn', { day: day(one.workDate) }) : t('days', { n: days })}</p>
        <Link prefetch={false}
          href={one ? `/punch/corrections?date=${one.workDate}&kind=${one.kind}` : '/punch/corrections?new=1'}
          className="inline-flex min-h-11 items-center rounded-button border border-warn bg-bg px-3 text-sm font-semibold"
        >
          {t('request')}
        </Link>
      </div>
    </section>
  );
}
