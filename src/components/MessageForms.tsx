'use client';
// 전달 보내기(옛 사내게시판, 관리자만 — 2026-10-16 의뢰인 알림-8: 직원 글쓰기 · 답글 없음). 보내면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { CLOSE_SHEET_EVENT } from './AddSheet';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { RichEditor } from '@/components/RichEditor';
import { Button } from '@/components/ui';

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
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
// sheet: 팝업(AddSheet) 안이면 그 창 이름 — 보내면 닫는다 (2026-10-22: 게시판은 목록이 먼저, 글쓰기는 「+ 새 글」 팝업)
// 전달 보내기 (2026-11-02 의뢰인: 사내게시판 → 「전달」, 받는 사람은 직원 고르기만 — 체크박스로 여러 명)
export function NoticeCompose({ people, sheet }: { people: { id: string; label: string }[]; sheet?: string }) {
  const t = useTranslations('messages');
  const { busy, err, send } = useSend();
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0); // 보낸 뒤 편집기를 비운다(폼 reset은 편집기를 비우지 못한다)
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const el = e.currentTarget;
        const f = new FormData(el);
        setDone(null);
        const r = await send<{ recipients: number }>({ action: 'send', to: 'people', employeeIds: picked, title: f.get('title'), bodyHtml: f.get('bodyHtml') });
        if (r) {
          setDone(t('sentTo', { n: r.recipients }));
          el.reset();
          setPicked([]);
          setFormKey((k) => k + 1);
          if (sheet) window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        }
      }}
    >
      <fieldset className="flex flex-col rounded-button border border-border p-2">
        <legend className="px-1 text-muted">{t('to.people')}</legend>
        <div className="flex items-center gap-2 pb-1">
          <span className="num flex-1 text-muted">{t('pickedCount', { n: picked.length })}</span>
          <button type="button" onClick={() => setPicked(people.map((p) => p.id))} className="min-h-9 rounded-button px-2 font-semibold text-primary hover:bg-primary-tint">
            {t('pickAll')}
          </button>
          <button type="button" onClick={() => setPicked([])} className="min-h-9 rounded-button px-2 text-muted hover:bg-surface">
            {t('pickClear')}
          </button>
        </div>
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {people.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5 accent-primary" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
              <span className="min-w-0 break-words">{p.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <input name="title" required maxLength={120} placeholder={t('fTitle')} aria-label={t('fTitle')} className={field} autoComplete="off" />
      {/* 2026-10-16: 사진 · 간단한 서식 — 숨은 칸 bodyHtml로 보낸다(서버가 거른다) */}
      <RichEditor key={formKey} name="bodyHtml" kind="message" placeholder={t('fBody')} minHeight="min-h-40" />
      <p className="text-xs text-faint">{t('composeHint')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="messages" />}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy || picked.length === 0}>
          {t('send')}
        </Button>
        {done && <span role="status" className="text-ok">{done}</span>}
      </div>
    </form>
  );
}
