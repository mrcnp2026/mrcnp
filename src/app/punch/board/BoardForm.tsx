'use client';
// 게시판 글쓰기 · 고치기 폼, 지우기 단추 (2026-10-16)
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RichEditor } from '@/components/RichEditor';

async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<{ ok: boolean; id?: string; code?: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    return res.ok ? { ok: true, id: json.id } : { ok: false, code: json.error ?? 'generic' };
  } catch {
    return { ok: false, code: 'network' };
  }
}

export function BoardForm({ id, title = '', html = '' }: { id?: string; title?: string; html?: string }) {
  const t = useTranslations('board');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState(html);

  async function submit(fd: FormData) {
    setBusy(true);
    setErr(null);
    const r = await send(id ? `/api/board/${id}` : '/api/board', id ? 'PUT' : 'POST', { title: fd.get('title'), bodyHtml: body });
    setBusy(false);
    if (!r.ok) return setErr(t.has(`err.${r.code}`) ? t(`err.${r.code}`) : t('err.generic'));
    router.push(`/punch/board/${id ?? r.id}`);
    router.refresh();
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input name="title" required maxLength={200} defaultValue={title} placeholder={t('titlePlaceholder')} aria-label={t('titleLabel')} className="h-12 rounded-card border border-border bg-bg px-3 text-lg font-semibold outline-none focus:border-primary" />
      <RichEditor kind="board" defaultHtml={html} onChange={setBody} placeholder={t('bodyLabel')} minHeight="min-h-72" />
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="h-11 rounded-button border border-border px-5 text-sm font-semibold">{t('cancel')}</button>
        <button type="submit" disabled={busy} className="h-11 rounded-button bg-primary px-6 text-sm font-bold text-on-primary disabled:opacity-50">{id ? t('save') : t('post')}</button>
      </div>
    </form>
  );
}

export function BoardDelete({ id }: { id: string }) {
  const t = useTranslations('board');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="h-10 rounded-button border border-danger px-4 text-sm font-semibold text-danger">{t('delete')}</button>;
  return (
    <span className="flex items-center gap-2 text-sm">
      {t('deleteAsk')}
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await send(`/api/board/${id}`, 'DELETE'); setBusy(false); if (r.ok) { router.push('/punch/board'); router.refresh(); } }} className="h-10 rounded-button bg-danger px-4 font-bold text-on-primary">{t('deleteYes')}</button>
      <button type="button" onClick={() => setAsk(false)} className="h-10 rounded-button border border-border px-3">{t('cancel')}</button>
    </span>
  );
}
