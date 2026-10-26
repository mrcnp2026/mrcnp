'use client';
// 문의하기 — 보내는 칸 · 답변 칸 · 「답을 봤다」 표시 (DB 묶음 37, 2026-10-26). 글자 · 메뉴 이름은 서버가 번역해서 넘겨 준다.
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Select } from '@/components/Select';
import { Button } from '@/components/ui';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm';
type Err = { code: string; requestId?: string } | null;
export type SpaceOption = { id: 'my' | 'admin' | 'console' | 'other'; label: string };
export type TopicOption = { id: string; space: 'my' | 'admin' | 'console'; group: string; label: string };

function useCall(path: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(path, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send };
}

/** 문의 보내기 — 큰 분류를 고르면 그 분류의 메뉴가 아래에 나온다 */
export function AskForm({ spaces, topics, toLabel }: { spaces: SpaceOption[]; topics: TopicOption[]; toLabel: string }) {
  const t = useTranslations('inquiry');
  const { busy, err, send } = useCall('/api/inquiries');
  const [space, setSpace] = useState<SpaceOption['id']>(spaces[0].id);
  const [done, setDone] = useState(false);
  const [len, setLen] = useState(0);
  const groups = useMemo(() => {
    const m = new Map<string, TopicOption[]>();
    for (const x of topics.filter((o) => o.space === space)) m.set(x.group, [...(m.get(x.group) ?? []), x]);
    return [...m.entries()];
  }, [topics, space]);
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const el = e.currentTarget;
        const f = new FormData(el);
        setDone(false);
        const r = await send<{ id: string }>({ space, topic: space === 'other' ? null : f.get('topic') || null, title: f.get('title'), body: f.get('body') });
        if (r) {
          el.reset();
          setLen(0);
          setDone(true);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t('fSpace')}</span>
        <Select name="space" value={space} onChange={(ev) => setSpace(ev.target.value as SpaceOption['id'])} className={`${field} lg:max-w-md`}>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      {space !== 'other' && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t('fTopic')}</span>
          <Select key={space} name="topic" defaultValue="" className={`${field} lg:max-w-md`}>
            <option value="">{t('topicNone')}</option>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t('fTitle')}</span>
        <input name="title" required minLength={2} maxLength={100} autoComplete="off" className={`${field} lg:max-w-2xl`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{t('fBody')}</span>
        <textarea name="body" required minLength={2} maxLength={2000} rows={6} onChange={(ev) => setLen(ev.target.value.length)} className="w-full rounded-button border border-border bg-bg px-3 py-2 text-sm leading-6 lg:max-w-2xl" />
        <span className="num text-xs text-faint">{len} / 2000</span>
      </label>
      <p className="flex items-center gap-2 rounded-button bg-primary-tint px-3 py-2 text-xs font-medium text-primary lg:max-w-2xl">
        <Info aria-hidden size={14} strokeWidth={1.75} className="shrink-0" />
        {toLabel}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {t('send')}
        </Button>
        {done && <span role="status" className="text-ok">{t('sent')}</span>}
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="inquiry.err" />}
    </form>
  );
}

/** 관리자 답변 — 한 번 보내면 고치지 못한다 */
export function AnswerForm({ id }: { id: string }) {
  const t = useTranslations('inquiry');
  const { busy, err, send } = useCall('/api/admin/inquiries');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await send({ action: 'answer', id, answer: f.get('answer') });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{t('answer')}</span>
        <textarea name="answer" required maxLength={2000} rows={4} className="w-full rounded-button border border-border bg-bg px-3 py-2 text-sm leading-6" />
      </label>
      <p className="text-xs text-faint">{t('answerOnce')}</p>
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {t('answerSend')}
        </Button>
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="inquiry.err" />}
    </form>
  );
}

/** 안 본 답이 있는 채로 이 화면을 열었다 — 봤다고 남기고 숫자를 지운다 */
export function MarkSeen({ when }: { when: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!when) return;
    void callApi('/api/inquiries', { action: 'seen' }).then((r) => r.ok && router.refresh());
  }, [when, router]);
  return null;
}
