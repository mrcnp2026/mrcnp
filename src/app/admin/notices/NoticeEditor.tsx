'use client';
// 공지 작성·번역·게시 (②-5 7-15, 폰 기준). 사진은 다음 단계(아직 없음).
// 순서: ① 한국어 제목·본문 저장 → ② 번역 초안(켜진 언어만, 지금은 영어) → 고치고 「확인했음」 → ③ 게시
// 게시 뒤 고칠 때는 「내용 변경 — 다시 모두에게」(기본) / 「오타 수정」 중 하나 (요점 15). 삭제는 없고 보관만.
import { DateTimeInput } from '@/components/DateTimeInput';
import { Archive, Languages, Megaphone, RotateCcw, Save, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle, Chip } from '@/components/ui';

type Tr = { locale: string; title: string; body: string; source: 'machine' | 'human' | null; reviewed: boolean; numbersOk: boolean; stale: boolean };
type Initial = {
  id: string;
  title: string;
  body: string;
  important: boolean;
  legal: boolean;
  audience: 'all' | 'selected';
  targets: string[];
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'published' | 'archived';
  state: 'draft' | 'scheduled' | 'live' | 'ended' | 'archived';
  version: number;
  translations: Tr[];
  confirmed: string;
  notConfirmed: string[];
};

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
const LANG: Record<string, string> = { en: 'English', vi: 'Tiếng Việt', th: 'ภาษาไทย' };

export function NoticeEditor({ people, initial }: { people: { id: string; name: string }[]; initial: Initial | null }) {
  const t = useTranslations('admin.notices');
  const tc = useTranslations('common');
  const router = useRouter();
  const [f, setF] = useState({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    important: initial?.important ?? false,
    legal: initial?.legal ?? false,
    audience: initial?.audience ?? ('all' as 'all' | 'selected'),
    targets: initial?.targets ?? ([] as string[]),
    startsAt: initial?.startsAt ?? '',
    endsAt: initial?.endsAt ?? '',
    mode: 'reshow' as 'reshow' | 'typo',
  });
  const [trs, setTrs] = useState<Tr[]>(initial?.translations ?? []);
  // 저장·번역 초안 뒤 서버가 새 값을 주면 칸과 표시(숫자 확인 필요 등)를 새로 채운다
  const serverTrs = JSON.stringify(initial?.translations ?? []);
  useEffect(() => setTrs(JSON.parse(serverTrs) as Tr[]), [serverTrs]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'archive' | null>(null);
  const published = initial?.status === 'published';

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await callApi<{ id: string }>(initial ? `/api/admin/notices/${initial.id}` : '/api/admin/notices', f);
    setBusy(false);
    if (!r.ok) return setErr(r);
    if (!initial) return router.replace(`/admin/notices/${r.data.id}`);
    setMsg(t('saved'));
    router.refresh();
  }

  async function translate() {
    if (!initial) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await callApi<{ results: { locale: string; ok: boolean; reason?: string }[] }>(`/api/admin/notices/${initial.id}/translate`);
    setBusy(false);
    if (!r.ok) return setErr(r);
    const failed = r.data.results.filter((x) => !x.ok);
    setMsg(failed.length ? t(failed[0].reason === 'no_key' ? 'translateNoKey' : 'translateFailed') : t('translated'));
    router.refresh();
  }

  async function saveTr(tr: Tr) {
    if (!initial) return;
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/notices/${initial.id}/translation`, tr);
    setBusy(false);
    if (!r.ok) return setErr(r);
    setMsg(t('saved'));
    router.refresh();
  }

  async function status(action: 'publish' | 'archive' | 'restore') {
    if (!initial) return;
    setBusy(true);
    setErr(null);
    const r = await callApi(`/api/admin/notices/${initial.id}/status`, { action });
    setBusy(false);
    setConfirm(null);
    if (!r.ok) return setErr(r);
    router.refresh();
  }

  const upd = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const audienceCount = f.audience === 'all' ? people.length : f.targets.length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <Megaphone aria-hidden size={24} strokeWidth={1.75} />
          {initial ? t('edit') : t('new')}
        </h1>
        {initial && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={initial.state === 'live' ? 'ok' : initial.state === 'scheduled' ? 'info' : 'neutral'}>{t(`state.${initial.state}`)}</Chip>
            {initial.status === 'published' && <span className="num text-sm text-muted">{initial.confirmed}</span>}
          </div>
        )}
        {initial && initial.notConfirmed.length > 0 && initial.status === 'published' && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer content-center text-primary">{t('notConfirmed')}</summary>
            <p className="text-muted">{initial.notConfirmed.join(', ')}</p>
          </details>
        )}
      </header>

      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('titleLabel')}
          <input value={f.title} maxLength={120} onChange={(e) => upd({ title: e.target.value })} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('bodyLabel')}
          <textarea value={f.body} maxLength={4000} rows={7} onChange={(e) => upd({ body: e.target.value })} className="w-full rounded-button border border-border bg-bg p-3 text-base text-text lg:min-h-96" />
          <span className="text-xs text-faint">{t('bodyHint')}</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={f.important} onChange={(e) => upd({ important: e.target.checked })} />
          <span>{t('important')}</span>
          <span className="text-xs text-faint">{t('importantHint')}</span>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={f.legal} onChange={(e) => upd({ legal: e.target.checked })} />
          <span>{t('legal')}</span>
          <span className="text-xs text-faint">{t('legalHint')}</span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-muted">{t('audience')}</legend>
          {(['all', 'selected'] as const).map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2">
              <input type="radio" className="size-5" checked={f.audience === a} onChange={() => upd({ audience: a })} />
              {t(a === 'all' ? 'audienceAll' : 'audienceSelected')}
            </label>
          ))}
          {f.audience === 'selected' && (
            <div className="flex flex-col rounded-button border border-border p-2">
              {people.map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={f.targets.includes(p.id)}
                    onChange={(e) => upd({ targets: e.target.checked ? [...f.targets, p.id] : f.targets.filter((x) => x !== p.id) })}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('startsAt')}
            <DateTimeInput type="datetime-local" value={f.startsAt} onChange={(v) => upd({ startsAt: v })} className={`num ${field}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('endsAt')}
            <DateTimeInput type="datetime-local" value={f.endsAt} onChange={(v) => upd({ endsAt: v })} className={`num ${field}`} />
          </label>
        </div>
        {published && (
          <fieldset className="flex flex-col gap-1 rounded-button bg-surface p-3">
            <legend className="text-sm font-semibold">{t('editMode')}</legend>
            {(['reshow', 'typo'] as const).map((m) => (
              <label key={m} className="flex min-h-11 items-start gap-2 pt-2">
                <input type="radio" className="mt-0.5 size-5" checked={f.mode === m} onChange={() => upd({ mode: m })} />
                <span className="text-sm">{t(m === 'reshow' ? 'modeReshow' : 'modeTypo')}</span>
              </label>
            ))}
          </fieldset>
        )}
        <Button variant="outline" disabled={busy || !f.title.trim() || !f.body.trim()} onClick={save} className="w-full">
          <Save aria-hidden size={18} strokeWidth={1.75} />
          {initial ? t('save') : t('saveDraft')}
        </Button>
      </Card>

      {initial && (
        <Card className="flex flex-col gap-3">
          <CardTitle icon={Languages}>{t('translations')}</CardTitle>
          <p className="text-sm text-muted">{t('translationsHint')}</p>
          <Button variant="outline" disabled={busy} onClick={translate} className="w-full">
            {t('translate')}
          </Button>
          {trs.map((tr, i) => (
            <div key={tr.locale} className="flex flex-col gap-2 rounded-button border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{LANG[tr.locale] ?? tr.locale}</span>
                {tr.source && <Chip>{t(tr.source === 'machine' ? 'machine' : 'human')}</Chip>}
                {tr.source && !tr.numbersOk && <Chip tone="warn">{t('numbersCheck')}</Chip>}
                {tr.stale && <Chip tone="warn">{t('stale')}</Chip>}
                {tr.reviewed && <Chip tone="ok">{t('reviewed')}</Chip>}
              </div>
              <input
                value={tr.title}
                lang={tr.locale}
                aria-label={t('trTitle', { lang: LANG[tr.locale] ?? tr.locale })}
                onChange={(e) => setTrs(trs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className={field}
              />
              <textarea
                value={tr.body}
                lang={tr.locale}
                rows={6}
                aria-label={t('trBody', { lang: LANG[tr.locale] ?? tr.locale })}
                onChange={(e) => setTrs(trs.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                className="w-full rounded-button border border-border bg-bg p-3 text-base text-text"
              />
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5" checked={tr.reviewed} onChange={(e) => setTrs(trs.map((x, j) => (j === i ? { ...x, reviewed: e.target.checked } : x)))} />
                {t('reviewedCheck')}
              </label>
              <Button variant="outline" disabled={busy || !tr.title.trim() || !tr.body.trim()} onClick={() => saveTr(tr)} className="w-full">
                {t('saveTranslation')}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {msg && <p className="text-sm font-semibold text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.notices" />}

      {initial && confirm && (
        <Card className="flex flex-col gap-2 border-primary">
          <p className="text-sm">{confirm === 'publish' ? t('confirmPublish', { n: audienceCount }) : t('confirmArchive')}</p>
          <div className="flex gap-2">
            <Button disabled={busy} className="flex-1" onClick={() => status(confirm)}>
              {t('confirm')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      )}
      {initial && !confirm && (
        <div className="flex flex-col gap-2">
          {initial.status === 'draft' && (
            <Button disabled={busy} onClick={() => setConfirm('publish')} className="min-h-14 w-full">
              <Send aria-hidden size={20} strokeWidth={1.75} />
              {t('publish')}
            </Button>
          )}
          {initial.status === 'published' && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirm('archive')} className="w-full">
              <Archive aria-hidden size={18} strokeWidth={1.75} />
              {t('archiveAction')}
            </Button>
          )}
          {initial.status === 'archived' && (
            <Button variant="outline" disabled={busy} onClick={() => status('restore')} className="w-full">
              <RotateCcw aria-hidden size={18} strokeWidth={1.75} />
              {t('restore')}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-faint">{tc('translationNotice')}</p>
    </div>
  );
}
