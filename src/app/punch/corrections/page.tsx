// 직원 "정정 요청" — 빠진 기록 추가(4-8의 유일한 채우는 길) · 시각 수정 · 잘못 찍은 기록 무효 (7-10).
// 원본은 그대로 남고, 관리자가 승인한 정정만 집계에 쓰인다. 배너에서 오면 날짜·종류가 미리 채워진다.
import { SheetOpener } from '@/components/SheetOpener';
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
import { loadRejectReasons } from '@/lib/reject-reason';
import { toKstDate } from '@/lib/time';
import { CorrectionForm, type TodoItem } from './CorrectionForm';

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
  // 정정이 필요한 기록 (2026-10-21 의뢰인) — 빠진 것은 「빠진 기록 추가」, 지각 · 조퇴는 「시각 수정」으로 미리 채운다
  const todo: TodoItem[] = r.todo.map((x) => ({
    key: `${x.workDate}-${x.kind}-${x.issue}`,
    type: x.issue === 'missing' ? 'add_missing' : 'modify',
    workDate: x.workDate,
    day: day(x.workDate),
    kind: x.kind,
    eventId: x.eventId,
    time: x.issue === 'missing' ? x.planned : x.at,
    title: t(`todo.${x.issue === 'missing' ? `missing_${x.kind}` : x.issue}`, { day: day(x.workDate), time: x.at ?? '' }),
    sub: x.planned ? t(x.kind === 'in' ? 'todo.plannedIn' : 'todo.plannedOut', { time: x.planned }) : '',
    pending: x.pending,
  }));
  // 거절 사유 (2026-10-21 의뢰인)
  const why = await loadRejectReasons(r.corrections.filter((c) => c.status === 'rejected').map((c) => ({ table: 'punch_corrections', id: c.id })));
  const trq = await getTranslations('requests');
  const wantDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const wantKind = sp.kind === 'in' || sp.kind === 'out' ? sp.kind : null;
  const initialTodo = wantDate ? (todo.find((x) => x.workDate === wantDate && (!wantKind || x.kind === wantKind) && !x.pending)?.key ?? null) : null;

  return (
    <PageShell wide>
      <Link href="/punch/requests" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-muted">
        ‹ {t('backToRequests')}
      </Link>
      <div className="flex flex-wrap items-center gap-x-1">
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <Help>{t('intro')}</Help>
        <SheetOpener id="correction" label={t('title')} className="ml-auto hidden lg:inline-flex" />
      </div>
      {/* PC: 왼쪽 = 요청 쓰기, 오른쪽 = 내 요청 (2026-10-06 의뢰인) · 폰: 내 요청 목록이 먼저, 쓰는 양식은 + 버튼을 누르면 올라온다 (2026-10-10 의뢰인) */}
      <div className="flex flex-col gap-3">
      {/* 미기록 배너에서 날짜를 채워 넘어왔거나 ?new=1이면 열린 채로 시작한다 */}
      <AddSheet id="correction" title={t('title')} defaultOpen={!!sp.date || sp.new === '1'} modal>
      <CorrectionForm
        today={toKstDate(new Date())}
        initialDate={wantDate}
        initialKind={wantKind}
        todo={todo}
        initialTodo={initialTodo}
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
            {why.get(`punch_corrections:${c.id}`) && <span className="text-sm break-words text-danger">{trq('rejectReason', { why: why.get(`punch_corrections:${c.id}`)! })}</span>}
          </Row>
        ))}
        </RowList>
      </section>
      </div>
      <Fab label={trq('new')} items={[{ id: 'correction', label: t('title') }]} />
    </PageShell>
  );
}
