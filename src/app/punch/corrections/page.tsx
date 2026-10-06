// 직원 "정정 요청" — 빠진 기록 추가(4-8의 유일한 채우는 길) · 시각 수정 · 잘못 찍은 기록 무효 (7-10).
// 원본은 그대로 남고, 관리자가 승인한 정정만 집계에 쓰인다. 배너에서 오면 날짜·종류가 미리 채워진다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Help } from '@/components/Help';
import { Card, Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { toKstDate } from '@/lib/time';
import { CorrectionForm } from './CorrectionForm';

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ date?: string; kind?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('corrections');
  const f = await getFormatter();
  const sp = await searchParams;
  const r = await loadEmployeeRecent(me.id, new Date());
  const hm = (d: Date | null) => (d ? f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });

  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-x-1">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <Help>{t('intro')}</Help>
      </div>
      <CorrectionForm
        today={toKstDate(new Date())}
        initialDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null}
        initialKind={sp.kind === 'in' || sp.kind === 'out' ? sp.kind : null}
        events={[...r.events].reverse().map((e) => ({ id: e.id, label: `${day(e.workDate)} · ${t(`kind.${e.kind}`)} ${hm(e.punchedAt)}` }))}
      />
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('mine')}</h2>
        {r.corrections.length === 0 && <p className="text-sm text-faint">{t('none')}</p>}
        {[...r.corrections].reverse().map((c) => (
          <Card key={c.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{day(c.workDate)} · {t(`type.${c.correctionType}`)}</span>
              <Chip tone={c.status === 'approved' ? 'ok' : c.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${c.status}`)}</Chip>
            </div>
            {c.newPunchedAt && <p className="num text-sm">{t(`kind.${c.kind}`)} {hm(c.newPunchedAt)}</p>}
            <p className="text-sm text-muted">{c.reason}</p>
          </Card>
        ))}
      </section>
    </PageShell>
  );
}
