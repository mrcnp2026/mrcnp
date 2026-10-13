'use client';
// 업무 메시지의 입력부 — 통지 쓰기(관리자) · 문의 쓰기(직원) · 회신 · 그 직원에게만 답하기. 보내면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
const area = 'min-h-28 rounded-button border border-border bg-bg p-3 text-sm';
type Err = { code: string; requestId?: string } | null;

function useSend() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>('/api/messages', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}

/** 관리자: 전체 · 부서 · 개인에게 통지 */
export function NoticeCompose({ groups, people }: { groups: { id: string; label: string }[]; people: { id: string; label: string }[] }) {
  const t = useTranslations('messages');
  const { busy, err, send } = useSend();
  const [to, setTo] = useState<'all' | 'groups' | 'people'>('all');
  const [done, setDone] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const el = e.currentTarget;
        const f = new FormData(el);
        setDone(null);
        const r = await send<{ recipients: number }>({ action: 'send', to, groupIds: f.getAll('groupIds'), employeeIds: f.getAll('employeeIds'), title: f.get('title'), body: f.get('body'), needsReply: f.get('needsReply') === 'on' });
        if (r) {
          setDone(t('sentTo', { n: r.recipients }));
          el.reset();
        }
      }}
    >
      <div className="flex flex-wrap gap-4">
        {(['all', 'groups', 'people'] as const).map((k) => (
          <label key={k} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="to" checked={to === k} onChange={() => setTo(k)} className="size-5 accent-primary" />
            {t(`to.${k}`)}
          </label>
        ))}
      </div>
      {to === 'groups' && (
        <select name="groupIds" multiple required size={Math.min(6, Math.max(2, groups.length))} aria-label={t('to.groups')} className={`${field} py-2`}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      )}
      {to === 'people' && (
        <select name="employeeIds" multiple required size={Math.min(8, Math.max(2, people.length))} aria-label={t('to.people')} className={`${field} py-2`}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      <input name="title" required maxLength={120} placeholder={t('fTitle')} aria-label={t('fTitle')} className={field} autoComplete="off" />
      <textarea name="body" required maxLength={4000} placeholder={t('fBody')} aria-label={t('fBody')} className={area} />
      <label className="flex min-h-9 items-center gap-2">
        <input type="checkbox" name="needsReply" className="size-5 accent-primary" />
        {t('fNeedsReply')}
      </label>
      <p className="text-xs text-faint">{t('composeHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="messages" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t('send')}
        </Button>
        {done && <span role="status" className="text-ok">{done}</span>}
      </div>
    </form>
  );
}

/** 직원: 관리자에게 문의 */
export function InquiryCompose() {
  const t = useTranslations('messages');
  const { busy, err, send, router } = useSend();
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t('ask')}
      </Button>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await send<{ id: string }>({ action: 'inquiry', title: f.get('title'), body: f.get('body') });
        if (r) router.push(`/punch/messages/${r.id}`);
      }}
    >
      <p className="font-bold">{t('askTitle')}</p>
      <input name="title" required maxLength={120} placeholder={t('fTitle')} aria-label={t('fTitle')} className={field} autoComplete="off" />
      <textarea name="body" required maxLength={4000} placeholder={t('fBody')} aria-label={t('fBody')} className={area} />
      <p className="text-xs text-faint">{t('askHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="messages" />}
      <span className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t('send')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </span>
    </form>
  );
}

/** 회신. answerTo가 있으면(관리자가 여러 명에게 보낸 통지에서) 고른 직원 한 명에게만 가는 새 메시지로 답한다 */
export function ReplyForm({ id, answerTo }: { id: string; answerTo?: { id: string; label: string }[] }) {
  const t = useTranslations('messages');
  const { busy, err, send } = useSend();
  const [done, setDone] = useState(false);
  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const el = e.currentTarget;
        const f = new FormData(el);
        setDone(false);
        const r = await send(answerTo ? { action: 'answer', id, employeeId: f.get('employeeId'), body: f.get('body') } : { action: 'reply', id, body: f.get('body') });
        if (r) {
          el.reset();
          setDone(!!answerTo);
        }
      }}
    >
      {answerTo && (
        <label className="flex flex-col gap-1">
          <span className="font-bold">{t('answerTo')}</span>
          <select name="employeeId" required className={field}>
            {answerTo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <textarea name="body" required maxLength={4000} placeholder={t(answerTo ? 'fAnswer' : 'fReply')} aria-label={t(answerTo ? 'fAnswer' : 'fReply')} className={area} />
      {answerTo && <p className="text-xs text-faint">{t('answerHint')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="messages" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t(answerTo ? 'answerDo' : 'replyDo')}
        </Button>
        {done && <span role="status" className="text-ok">{t('answerDone')}</span>}
      </div>
    </form>
  );
}
