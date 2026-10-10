// 직원 "정정 요청" — 빠진 기록 추가(4-8의 유일한 채우는 길) · 시각 수정 · 잘못 찍은 기록 무효 (7-10).
// 원본은 그대로 남고, 관리자가 승인한 정정만 집계에 쓰인다. 배너에서 오면 날짜·종류가 미리 채워진다.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddSheet } from '@/components/AddSheet';
import { Fab } from '@/components/Fab';
import { Help } from '@/components/Help';
import { Row, RowList } from '@/components/list';
import { Chip, PageShell } from '@/components/ui';
import { getMe } from '@/lib/auth';
import { loadEmployeeRecent } from '@/lib/employee-data';
import { toKstDate } from '@/lib/time';
import { CorrectionForm } from './CorrectionForm';

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<{ date?: string; kind?: string; new?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const t = await getTranslations('corrections');
  const tc = await getTranslations('common');
  const f = await getFormatter();
  const sp = await searchParams;
  const r = await loadEmployeeRecent(me.id, new Date());
  const hm = (d: Date | null) => (d ? f.dateTime(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const day = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });

  return (
    <PageShell wide>
      <Link href="/punch/requests" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('backToRequests')}
      </Link>
      <div className="flex flex-wrap items-center gap-x-1">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <Help>{t('intro')}</Help>
      </div>
      {/* PC: 왼쪽 = 요청 쓰기, 오른쪽 = 내 요청 (2026-10-06 의뢰인) · 폰: 내 요청 목록이 먼저, 쓰는 양식은 + 버튼을 누르면 올라온다 (2026-10-10 의뢰인) */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      {/* 미기록 배너에서 날짜를 채워 넘어왔거나 ?new=1이면 열린 채로 시작한다 */}
      <AddSheet id="correction" title={t('title')} defaultOpen={!!sp.date || sp.new === '1'}>
      <CorrectionForm
        today={toKstDate(new Date())}
        initialDate={sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null}
        initialKind={sp.kind === 'in' || sp.kind === 'out' ? sp.kind : null}
        events={[...r.events].reverse().map((e) => ({ id: e.id, label: `${day(e.workDate)} · ${t(`kind.${e.kind}`)} ${hm(e.punchedAt)}` }))}
      />
      </AddSheet>
      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-semibold">{t('mine')}</h2>
        {r.corrections.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('none')}</p>}
        <RowList>
        {[...r.corrections].reverse().map((c) => (
          <Row key={c.id} aside={<Chip tone={c.status === 'approved' ? 'ok' : c.status === 'pending' ? 'warn' : 'neutral'}>{t(`status.${c.status}`)}</Chip>}>
            <span className="font-semibold">{day(c.workDate)} · {t(`type.${c.correctionType}`)}</span>
            {c.newPunchedAt && <span className="num text-sm">{t(`kind.${c.kind}`)} {hm(c.newPunchedAt)}</span>}
            <span className="text-sm text-muted">{c.reason}</span>
          </Row>
        ))}
        </RowList>
      </section>
      </div>
      <Fab label={tc('add')} items={[{ id: 'correction', label: t('title') }]} />
    </PageShell>
  );
}
