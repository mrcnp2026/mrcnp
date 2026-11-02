'use client';
// 공지 작성 · 게시 (②-5 7-15, 폰 기준).
// 2026-11-02 의뢰인: 임시 저장 · 번역 단계를 없앴다 — 쓰고 「게시」 한 번이면 저장과 게시가 같이 된다. 대상은 전체 또는 지점 선택 두 가지.
//   지점을 고르면 그 지점(하위 팀 포함)의 직원으로 받는 사람이 정해진다(저장할 때 고정).
// 게시 뒤 고칠 때는 「내용 변경 — 다시 모두에게」(기본) / 「오타 수정」 중 하나 (요점 15). 삭제는 없고 보관만.
import { DateTimeInput } from '@/components/DateTimeInput';
import { Archive, Megaphone, RotateCcw, Save, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { RichEditor } from '@/components/RichEditor';
import { textToHtml } from '@/lib/rich-text-plain';
import { Button, Card, Chip } from '@/components/ui';

type Initial = {
  id: string;
  title: string;
  body: string;
  bodyHtml?: string | null; // 서식 있는 본문(2026-10-16). 없으면 글자 본문을 문단으로 바꿔 편집기에 넣는다
  important: boolean;
  legal: boolean;
  audience: 'all' | 'selected';
  targets: string[];
  startsAt: string;
  endsAt: string;
  status: 'draft' | 'published' | 'archived';
  state: 'draft' | 'scheduled' | 'live' | 'ended' | 'archived';
  version: number;
  confirmed: string;
  notConfirmed: string[];
};

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Person = { id: string; name: string; groupId: string | null };
type Group = { id: string; label: string; parentId: string | null };

/** 고른 지점(하위 팀 포함)의 직원 */
function membersOf(groups: Group[], people: Person[], picked: string[]): string[] {
  const g = new Set(picked);
  for (let n = 0; n < 3; n++) for (const x of groups) if (x.parentId && g.has(x.parentId)) g.add(x.id);
  return people.filter((p) => p.groupId && g.has(p.groupId)).map((p) => p.id);
}

export function NoticeEditor({ people, groups, initial }: { people: Person[]; groups: Group[]; initial: Initial | null }) {
  const t = useTranslations('admin.notices');
  const router = useRouter();
  const [f, setF] = useState({
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    bodyHtml: initial?.bodyHtml || (initial?.body ? textToHtml(initial.body) : ''),
    important: initial?.important ?? false,
    legal: initial?.legal ?? false,
    audience: initial?.audience ?? ('all' as 'all' | 'selected'),
    targets: initial?.targets ?? ([] as string[]),
    startsAt: initial?.startsAt ?? '',
    endsAt: initial?.endsAt ?? '',
    mode: 'reshow' as 'reshow' | 'typo',
  });
  // 지점 고르기: 예전에 받는 사람을 정해 둔 공지는 그 사람들이 전부 들어 있는 지점을 골라 둔 것으로 보여 준다
  const [picked, setPicked] = useState<string[]>(() => {
    const tg = new Set(initial?.targets ?? []);
    return groups.filter((g) => { const m = membersOf(groups, people, [g.id]); return m.length > 0 && m.every((id) => tg.has(id)); }).map((g) => g.id);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'archive' | null>(null);
  const published = initial?.status === 'published';

  const targets = f.audience === 'all' ? [] : membersOf(groups, people, picked);
  const body = { ...f, legal: false, targets }; // 법적 · 급여 표시는 번역 확인용이라 번역과 함께 없앴다 (2026-11-02)

  async function save(): Promise<string | null> {
    const r = await callApi<{ id: string }>(initial ? `/api/admin/notices/${initial.id}` : '/api/admin/notices', body);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    return initial?.id ?? r.data.id;
  }

  // 게시 = 저장 + 게시 (임시 저장 없음)
  async function publish() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const id = await save();
    if (!id) {
      setBusy(false);
      setConfirm(null);
      return;
    }
    const r = await callApi(`/api/admin/notices/${id}/status`, { action: 'publish' });
    setBusy(false);
    setConfirm(null);
    if (!r.ok) {
      setErr(r);
      if (!initial) router.replace(`/admin/notices/${id}`); // 저장은 됐다 — 그 화면에서 다시 게시
      return;
    }
    router.push('/admin/notices');
    router.refresh();
  }

  // 게시한 공지 고치기
  async function saveEdit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const id = await save();
    setBusy(false);
    if (!id) return;
    setMsg(t('saved'));
    router.refresh();
  }

  async function status(action: 'archive' | 'restore') {
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
  const audienceCount = f.audience === 'all' ? people.length : targets.length;
  const ready = !!f.title.trim() && !!f.bodyHtml && (f.audience === 'all' || targets.length > 0);

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
        <div className="flex flex-col gap-1 text-sm text-muted">
          {t('bodyLabel')}
          {/* 2026-10-16: 사진 · 간단한 서식. 글자 본문(번역 · 알림용)은 서버가 여기서 뽑는다 */}
          <RichEditor kind="notice" defaultHtml={f.bodyHtml} onChange={(h) => upd({ bodyHtml: h })} placeholder={t('bodyLabel')} minHeight="min-h-56 lg:min-h-96" />
          <span className="text-xs text-faint">{t('bodyHint')}</span>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={f.important} onChange={(e) => upd({ important: e.target.checked })} />
          <span>{t('important')}</span>
          <span className="text-xs text-faint">{t('importantHint')}</span>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-muted">{t('audience')}</legend>
          {(['all', 'selected'] as const).map((a) => (
            <label key={a} className="flex min-h-11 items-center gap-2">
              <input type="radio" className="size-5" checked={f.audience === a} onChange={() => upd({ audience: a })} />
              {t(a === 'all' ? 'audienceAll' : 'audienceGroups')}
            </label>
          ))}
          {f.audience === 'selected' && (
            <div className="flex flex-col rounded-button border border-border p-2">
              <span className="num pb-1 text-sm text-muted">{t('groupCount', { g: picked.length, n: targets.length })}</span>
              {groups.map((g) => (
                <label key={g.id} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="size-5" checked={picked.includes(g.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, g.id] : picked.filter((x) => x !== g.id))} />
                  <span className="min-w-0 break-words">{g.label}</span>
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
        {published && (
          <Button variant="outline" disabled={busy || !ready} onClick={saveEdit} className="w-full">
            <Save aria-hidden size={18} strokeWidth={1.75} />
            {t('save')}
          </Button>
        )}
      </Card>

      {msg && <p className="text-sm font-semibold text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.notices" />}

      {confirm && (
        <Card className="flex flex-col gap-2 border-primary">
          <p className="text-sm">{confirm === 'publish' ? t('confirmPublish', { n: audienceCount }) : t('confirmArchive')}</p>
          <div className="flex gap-2">
            <Button disabled={busy} className="flex-1" onClick={() => (confirm === 'publish' ? publish() : status(confirm))}>
              {t('confirm')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </Button>
          </div>
        </Card>
      )}
      {!confirm && (
        <div className="flex flex-col gap-2">
          {(!initial || initial.status === 'draft') && (
            <Button disabled={busy || !ready} onClick={() => setConfirm('publish')} className="min-h-14 w-full">
              <Send aria-hidden size={20} strokeWidth={1.75} />
              {t('publish')}
            </Button>
          )}
          {initial?.status === 'published' && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirm('archive')} className="w-full">
              <Archive aria-hidden size={18} strokeWidth={1.75} />
              {t('archiveAction')}
            </Button>
          )}
          {initial?.status === 'archived' && (
            <Button variant="outline" disabled={busy} onClick={() => status('restore')} className="w-full">
              <RotateCcw aria-hidden size={18} strokeWidth={1.75} />
              {t('restore')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
