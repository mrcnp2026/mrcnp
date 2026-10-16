'use client';
// 직원 비고 (묶음 19, 2026-10-16 의뢰인) — 그 사람에 대한 메모. 한 번에 4줄 정도(500자까지) 쓰고, 목록은 4건씩 넘겨 본다.
// 관리자만 보고 쓴다. 지우기는 한 번 더 묻는다(숨기기 — 변경 기록에 남는다).
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const PAGE = 4;
const MAX = 500;
export type NoteView = { id: string; body: string; createdAt: string; author: string };

export function StaffNotes({ employeeId, notes }: { employeeId: string; notes: NoteView[] | null }) {
  const t = useTranslations('admin.notes');
  const f = useFormatter();
  const router = useRouter();
  const [body, setBody] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  if (notes === null) return <p className="text-sm text-muted">{t('notReady')}</p>;
  const pages = Math.max(1, Math.ceil(notes.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = notes.slice(at * PAGE, at * PAGE + PAGE);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/employees/${employeeId}/notes`, payload);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const r = await callApi(`/api/admin/employees/${employeeId}/notes`, { body });
          if (!r.ok) return setErr(r);
          setBody('');
          setPage(0);
          router.refresh();
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('add')}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={MAX} placeholder={t('placeholder')} className="w-full resize-y rounded-button border border-border bg-bg p-3 text-base text-text lg:text-sm" />
        </label>
        <div className="flex items-center gap-3">
          <span className="num text-xs text-faint">{t('count', { n: body.length, max: MAX })}</span>
          <Button type="submit" size="sm" disabled={busy || !body.trim()} className="ml-auto min-h-11 lg:min-h-9">
            {t('save')}
          </Button>
        </div>
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.notes" />}
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-faint">{t('none')}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {shown.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 py-3">
                <p className="text-sm break-words whitespace-pre-wrap">{n.body}</p>
                <div className="flex items-center gap-2">
                  <span className="num min-w-0 flex-1 truncate text-xs text-faint">
                    {f.dateTime(new Date(n.createdAt), { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} · {n.author}
                  </span>
                  {asking === n.id ? (
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => setAsking(null)} className="min-h-9 rounded-button px-2 text-xs font-semibold text-muted hover:bg-surface">
                        {t('keep')}
                      </button>
                      <button type="button" disabled={busy} onClick={async () => { if (await send({ remove: n.id })) setAsking(null); }} className="min-h-9 rounded-button bg-danger px-3 text-xs font-bold text-on-primary disabled:opacity-50">
                        {t('removeDo')}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setAsking(n.id)} aria-label={t('remove')} className="flex size-9 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-danger">
                      <Trash2 aria-hidden size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label={t('pager')} className="flex items-center justify-between gap-2">
              <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-button px-3 text-sm font-semibold text-primary hover:bg-primary-tint disabled:text-faint disabled:hover:bg-transparent lg:min-h-9">
                <ChevronLeft aria-hidden size={18} />
                {t('newer')}
              </button>
              <span className="num text-sm text-muted">{t('pageOf', { n: at + 1, total: pages })}</span>
              <button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-button px-3 text-sm font-semibold text-primary hover:bg-primary-tint disabled:text-faint disabled:hover:bg-transparent lg:min-h-9">
                {t('older')}
                <ChevronRight aria-hidden size={18} />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
