'use client';
// 지점 만들기·고치기 양식 (2026-10-10). 지점 = 조직도의 그룹(부서 › 팀)과 같은 표다 — 이름만 시프티에 맞췄다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;

export function BranchAddForm({ parents, sheet }: { parents: { id: string; name: string }[]; sheet: string }) {
  const t = useTranslations('admin.branches');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setBusy(true);
        setErr(null);
        const res = await callApi<{ id: string }>('/api/admin/groups', { name: fd.get('name'), parentId: fd.get('parentId') || null });
        setBusy(false);
        if (!res.ok) return setErr(res);
        form.reset();
        window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        router.push(`/admin/branches/${res.data.id}`);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="name" required maxLength={40} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('parent')}
        <select name="parentId" defaultValue="" className={field}>
          <option value="">{t('parentNone')}</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.branches" />}
      <Button type="submit" disabled={busy}>
        {t('save')}
      </Button>
    </form>
  );
}

export function BranchEditForm({
  id,
  name,
  memo,
  active,
  places,
  picked,
  sheet,
}: {
  id: string;
  name: string;
  memo: string;
  active: boolean;
  places: { id: string; label: string; address: string | null }[];
  picked: string[];
  sheet: string;
}) {
  const t = useTranslations('admin.branches');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const [ask, setAsk] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const res = await callApi(`/api/admin/groups/${id}`, body);
    setBusy(false);
    if (!res.ok) {
      setErr(res);
      return false;
    }
    router.refresh();
    return true;
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (await send({ name: fd.get('name'), memo: fd.get('memo'), locationIds: fd.getAll('place') })) window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="name" required maxLength={40} defaultValue={name} className={field} autoComplete="off" />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm text-muted">{t('places')}</legend>
        <p className="text-sm text-faint">{t('placesHint')}</p>
        {places.length === 0 && <p className="text-sm text-faint">{t('placesEmpty')}</p>}
        {places.map((p) => (
          <label key={p.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="place" value={p.id} defaultChecked={picked.includes(p.id)} className="size-5 shrink-0 accent-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">{p.label}</span>
              {p.address && <span className="truncate text-sm text-muted">{p.address}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('memo')}
        <textarea name="memo" maxLength={500} rows={3} defaultValue={memo} className={`${field} py-2`} />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.branches" />}
      <Button type="submit" disabled={busy}>
        {t('save')}
      </Button>
      {active && !ask && (
        <button type="button" onClick={() => setAsk(true)} className="min-h-11 self-start text-sm font-medium text-muted">
          {t('hide')}
        </button>
      )}
      {active && ask && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{t('hideNote')}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="danger" disabled={busy} onClick={async () => (await send({ active: false })) && setAsk(false)}>
              {t('hideConfirm')}
            </Button>
            <button type="button" onClick={() => setAsk(false)} className="min-h-11 px-2 text-sm text-muted">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
      {!active && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => send({ active: true })}>
          {t('restore')}
        </Button>
      )}
    </form>
  );
}
