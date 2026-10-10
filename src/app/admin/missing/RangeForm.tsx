'use client';
// 누락 기록의 기간 고르기 — 시작·끝 날짜를 고르고 「보기」를 누르면 그 기간으로 다시 불러온다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTimeInput } from '@/components/DateTimeInput';
import { Button } from '@/components/ui';

const field = 'num min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';

export function RangeForm({ from, to, tab, today, live }: { from: string; to: string; tab: 'in' | 'out'; today: string; live: boolean }) {
  const t = useTranslations('admin.missing');
  const router = useRouter();
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  return (
    <form
      className="flex flex-col gap-2 rounded-card bg-bg p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new URLSearchParams({ from: a, to: b, tab });
        if (live) q.set('live', '1');
        router.push(`/admin/missing?${q}`);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          {t('from')}
          <DateTimeInput type="date" value={a} onChange={setA} max={today} required className={field} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
          {t('to')}
          <DateTimeInput type="date" value={b} onChange={setB} max={today} required className={field} />
        </label>
      </div>
      <Button type="submit" variant="outline" disabled={a === from && b === to}>
        {t('load')}
      </Button>
    </form>
  );
}
