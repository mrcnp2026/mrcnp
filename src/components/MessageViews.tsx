// 업무 메시지의 목록과 한 건 보기 — 직원 화면(/punch/messages)과 관리자 화면(/admin/messages)이 같이 쓴다.
// 읽음 수 · 누가 읽었는지는 보낸 사람과 관리자에게만 보인다(받는 사람끼리는 서로 보이지 않는다).
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { NoticeBody as MessageBody } from '@/components/NoticeBody';
import { RichHtml } from '@/components/RichHtml';
import { ReplyForm } from '@/components/MessageForms';
import { Card, Chip } from '@/components/ui';
import type { MessageLine, Thread } from '@/lib/work-messages';

export async function MessageList({ items, base, names, sent = false }: { items: MessageLine[]; base: string; names: Map<string, string>; sent?: boolean }) {
  const [t, f] = await Promise.all([getTranslations('messages'), getFormatter()]);
  const stamp = (iso: string) => f.dateTime(new Date(iso), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (items.length === 0) return <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg">
      {items.map((m) => {
        const unread = !sent && !m.readAt && !m.mine;
        return (
          <li key={m.id}>
            <Link href={`${base}/${m.id}`} className="flex flex-col gap-1 p-4">
              <span className="flex flex-wrap items-center gap-2">
                {unread && <Chip tone="warn">{t('unread')}</Chip>}
                <Chip tone={m.kind === 'inquiry' ? 'info' : 'neutral'}>{t(`kind.${m.kind}`)}</Chip>
                {m.needsReply && <Chip tone="info">{t('needsReply')}</Chip>}
                <span className={`min-w-0 truncate ${unread ? 'font-bold' : ''}`}>{m.title}</span>
              </span>
              <span className="num flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{m.senderId ? (names.get(m.senderId) ?? '') : t('system')}</span>
                <span>{stamp(m.createdAt)}</span>
                {sent && <span>{t('readCount', { read: m.read, all: m.recipients })}</span>}
                {m.replies > 0 && <span>{t('replyCount', { n: m.replies })}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export async function MessageThread({ thread, meId, names, back, admin = false }: { thread: Thread; meId: string; names: Map<string, string>; back: string; admin?: boolean }) {
  const [t, f] = await Promise.all([getTranslations('messages'), getFormatter()]);
  const stamp = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const who = (id: string | null) => (id ? (names.get(id) ?? '') : t('system'));
  const many = thread.recipients.length > 1;
  // 여러 명에게 보낸 통지에서 관리자가 답할 때는 한 명을 골라 그 사람에게만 간다
  const answerTo = admin && many ? thread.recipients.map((r) => ({ id: r.employeeId, label: names.get(r.employeeId) ?? '' })).sort((a, b) => a.label.localeCompare(b.label)) : undefined;
  return (
    <>
      <Link href={back} className="inline-flex min-h-9 items-center self-start text-sm font-medium text-muted">
        ‹ {t('title')}
      </Link>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={thread.kind === 'inquiry' ? 'info' : 'neutral'}>{t(`kind.${thread.kind}`)}</Chip>
          {thread.needsReply && <Chip tone="info">{t('needsReply')}</Chip>}
        </div>
        <h1 className="text-xl font-bold break-words">{thread.title}</h1>
        <p className="num text-xs text-muted">{who(thread.senderId)} · {stamp(thread.createdAt)}</p>
        <RichHtml html={thread.bodyHtml} text={thread.body} />
        {thread.related.href && thread.related.href.startsWith('/') && (
          <Link href={thread.related.href} className="inline-flex min-h-9 items-center self-start rounded-button border border-primary px-3 text-sm font-bold text-primary">
            {t('toRelated')}
          </Link>
        )}
      </Card>
      {thread.recipients.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-bold">{t('readTitle', { read: thread.recipients.filter((r) => r.readAt).length, all: thread.recipients.length })}</p>
          <ul className="num flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {thread.recipients.map((r) => (
              <li key={r.employeeId} className={r.readAt ? '' : 'text-warn'}>
                {names.get(r.employeeId) ?? ''} · {r.readAt ? stamp(r.readAt) : t('notRead')}
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">{t('readNote')}</p>
        </Card>
      )}
      <Card className="flex flex-col gap-3">
        <p className="text-sm font-bold">{t('repliesTitle', { n: thread.replies.length })}</p>
        {thread.replies.map((r) => (
          <div key={r.id} className={`flex flex-col gap-1 rounded-button p-3 ${r.authorId === meId ? 'bg-primary-tint' : 'bg-surface'}`}>
            <p className="num text-xs text-muted">{who(r.authorId)} · {stamp(r.createdAt)}</p>
            <MessageBody text={r.body} />
          </div>
        ))}
        {!admin && many && thread.iAmRecipient && <p className="text-xs text-faint">{t('manyNote')}</p>}
        {thread.kind !== 'system' || thread.senderId ? <ReplyForm id={thread.id} answerTo={answerTo} /> : <p className="text-xs text-faint">{t('systemNote')}</p>}
      </Card>
    </>
  );
}
