// 문의하기 화면 (2026-10-26 의뢰인: 종 옆 아이콘 → 문의하기 · 통합설정의 모든 메뉴를 문의 유형으로 · 알림은 앱 푸시). DB 묶음 37.
// 두 탭: 「문의하기」(보내기 + 내가 보낸 문의와 답) · 「받은 문의」(답할 수 있는 관리자만). 글자는 messages의 inquiry · frame 열쇠.
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { OFFICE } from '@/config/office';
import type { Me } from '@/lib/auth';
import { inquiryTopics, routeFor, topicById, type InquirySpace } from '@/lib/inquiry';
import { canAnswerFor, isSystem, loadMine, loadReceived, type Inquiry } from '@/lib/inquiry-data';
import { toKstDate } from '@/lib/time';
import { AnswerForm, AskForm, MarkSeen, type SpaceOption, type TopicOption } from './InquiryForms';
import { Card, Chip, PageShell } from './ui';

type Base = '/admin' | '/punch';
type Tr = Awaited<ReturnType<typeof getTranslations>>;

export async function InquiryCenter({ base, me, searchParams }: { base: Base; me: Me; searchParams: Promise<{ t?: string }> }) {
  const [t, tf, f, sp] = await Promise.all([getTranslations('inquiry'), getTranslations('frame'), getFormatter(), searchParams]);
  const practice = OFFICE.practiceMode;
  const sys = isSystem(me);
  const canReceive = sys || me.role === 'admin';
  const [mine, received] = await Promise.all([loadMine(me.id, practice), canReceive ? loadReceived(me, practice) : Promise.resolve([] as Inquiry[])]);
  const waiting = received.filter((q) => q.state === 'OPEN').length;
  const tab: 'ask' | 'received' = canReceive && (sp.t === 'received' || (sp.t === undefined && base === '/admin' && waiting > 0)) ? 'received' : 'ask';
  const unseen = mine.some((q) => q.state === 'ANSWERED' && !q.askerSeenAt);

  // 메뉴 이름 — 문의 유형은 메뉴 구성에서 자동으로 만들어진다
  const spaceLabel = (s: InquirySpace) => t(`space.${s}`);
  const appLabel = (space: 'my' | 'admin' | 'console', appKey: string, section?: 'company' | 'apps') => (space === 'console' ? `${tf(`console.${section ?? 'apps'}`)} · ${tf(`app.${appKey}`)}` : tf(`appFull.${appKey}`));
  const topics: TopicOption[] = inquiryTopics().map((x) => ({ id: x.id, space: x.space, group: appLabel(x.space, x.appKey, x.section), label: tf(`item.${x.leafKey}`) }));
  const spaces: SpaceOption[] = (['my', 'admin', 'console', 'other'] as const).filter((s) => s !== 'admin' || me.role !== 'employee').map((s) => ({ id: s, label: spaceLabel(s) }));
  const path = (q: Pick<Inquiry, 'space' | 'topic'>) => {
    const tp = topicById(q.topic);
    return tp ? `${spaceLabel(q.space)} › ${appLabel(tp.space, tp.appKey, tp.section)} › ${tf(`item.${tp.leafKey}`)}` : spaceLabel(q.space);
  };
  const when = (iso: string) => `${toKstDate(new Date(iso))} ${f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}`;
  const toLabel = t(routeFor(me.role) === 'SYSTEM' ? 'toSystem' : 'toAdmin');

  const tabLink = (k: 'ask' | 'received', label: string, n?: number) => (
    <Link href={`${base}/inquiry${k === 'received' ? '?t=received' : '?t=ask'}`} aria-current={tab === k ? 'page' : undefined} className={`inline-flex min-h-9 items-center gap-1.5 rounded-chip border px-3.5 text-sm font-semibold ${tab === k ? 'border-primary/30 bg-primary-tint text-primary' : 'border-border bg-bg text-muted hover:bg-surface'}`}>
      {label}
      {n !== undefined && n > 0 && <span className="num min-w-5 rounded-chip bg-danger px-1.5 text-center text-xs leading-5 font-bold text-on-primary">{n}</span>}
    </Link>
  );

  return (
    <PageShell wide>
      <MarkSeen when={tab === 'ask' && unseen} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        </div>
      </div>
      {canReceive && (
        <nav className="flex flex-wrap gap-2" aria-label={t('tabs')}>
          {tabLink('ask', t('tabAsk'), mine.filter((q) => q.state === 'ANSWERED' && !q.askerSeenAt).length)}
          {tabLink('received', t('tabReceived'), waiting)}
        </nav>
      )}

      {tab === 'ask' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-base font-bold">{t('newTitle')}</h2>
            <AskForm spaces={spaces} topics={topics} toLabel={toLabel} />
          </Card>
          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-base font-bold">{t('mineTitle')} <span className="num text-muted">{mine.length}</span></h2>
            {mine.length === 0 && <p className="rounded-card border border-border bg-bg p-6 text-sm text-muted">{t('mineEmpty')}</p>}
            {mine.map((q) => <Item key={q.id} q={q} t={t} path={path(q)} when={when} mode="mine" />)}
          </section>
        </div>
      )}

      {tab === 'received' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">{t('receivedTitle')} <span className="num text-muted">{received.length}</span></h2>
          {received.length === 0 && <p className="rounded-card border border-border bg-bg p-6 text-sm text-muted">{t('receivedEmpty')}</p>}
          {[...received.filter((q) => q.state === 'OPEN'), ...received.filter((q) => q.state === 'ANSWERED')].map((q) => (
            <Item key={q.id} q={q} t={t} path={path(q)} when={when} mode="received" answerable={canAnswerFor(me, q)} />
          ))}
        </section>
      )}
    </PageShell>
  );
}

function Item({ q, t, path, when, mode, answerable = false }: { q: Inquiry; t: Tr; path: string; when: (iso: string) => string; mode: 'mine' | 'received'; answerable?: boolean }) {
  const open = q.state === 'OPEN';
  const fresh = mode === 'mine' && q.state === 'ANSWERED' && !q.askerSeenAt;
  return (
    <details open={mode === 'received' ? open : fresh} className="group rounded-card border border-border bg-bg px-4 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <Chip tone={open ? 'warn' : 'neutral'}>{t(open ? 'stateOpen' : 'stateAnswered')}</Chip>
        {fresh && <Chip tone="info">{t('newAnswer')}</Chip>}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{q.title}</span>
        <span className="num text-xs text-faint">{mode === 'received' ? `${q.name} · ` : ''}{when(q.createdAt)}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <p className="text-xs text-faint">{path}</p>
        <p className="leading-7 whitespace-pre-line text-text">{q.body}</p>
        {q.answer && (
          <div className="rounded-button border border-primary/25 bg-primary-tint/50 px-4 py-3">
            <p className="mb-1 text-xs font-bold text-primary">{t('answerBy', { name: q.answeredByName ?? '', date: q.answeredAt ? when(q.answeredAt) : '' })}</p>
            <p className="leading-7 whitespace-pre-line text-text">{q.answer}</p>
          </div>
        )}
        {mode === 'received' && open && answerable && <AnswerForm id={q.id} />}
        {mode === 'received' && open && !answerable && <p className="text-xs text-muted">{t('cannotAnswer')}</p>}
        {mode === 'mine' && open && <p className="text-xs text-muted">{t('waitingNote')}</p>}
      </div>
    </details>
  );
}
