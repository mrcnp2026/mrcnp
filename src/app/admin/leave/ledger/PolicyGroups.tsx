'use client';
// 휴가 정책 그룹 (PRD 34.2 L06 · L07, 36.2 — 2026-10-15). 부서와 다른 묶음이다: 연차를 어떤 기준으로 만들지 · 만들지 않을지를 정한다.
// 기본 그룹(모두) · 그룹만의 기준을 쓰는 그룹 · 생성 제외 그룹. 직원은 한 번에 한 그룹에만 든다(날짜부터). 고르지 않은 직원은 기본 그룹 기준.
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle, Chip } from '@/components/ui';

export type GroupLine = { id: string; name: string; excluded: boolean; isDefault: boolean; ownPolicy: boolean; members: { employeeId: string; name: string; validFrom: string }[] };
const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';

export function PolicyGroups({ groups, people, today, current }: { groups: GroupLine[]; people: { id: string; name: string; groupId: string | null }[]; today: string; current: string | null }) {
  const t = useTranslations('admin.leaveLedger.groups');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await callApi('/api/admin/leave/ledger', body);
    setBusy(false);
    if (!r.ok) return setErr(r), false;
    setMsg(t('saved'));
    router.refresh();
    return true;
  };
  const def = groups.find((g) => g.isDefault);
  return (
    <Card>
      <CardTitle>{t('title')}</CardTitle>
      <p className="pt-1 text-sm text-muted">{t('intro')}</p>
      {msg && <p role="status" className="pt-2 text-sm text-ok">{msg}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveLedger.groups" />}
      <ul className="mt-3 flex flex-col gap-3">
        {groups.map((g) => (
          <li key={g.id} data-group={g.name} className={`rounded-card border p-3 text-sm ${current === g.id ? 'border-primary' : 'border-border'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b>{g.name}</b>
              {g.isDefault && <Chip tone="info">{t('default')}</Chip>}
              {g.excluded && <Chip tone="warn">{t('excluded')}</Chip>}
              {g.ownPolicy && <Chip tone="ok">{t('ownPolicy')}</Chip>}
              <span className="text-xs text-faint">{t('memberCount', { n: g.isDefault ? people.filter((p) => !p.groupId).length : g.members.length })}</span>
              <span className="ml-auto flex flex-wrap gap-2">
                {!g.isDefault && !g.excluded && !g.ownPolicy && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'group.policyStart', groupId: g.id })}>
                    {t('startPolicy')}
                  </Button>
                )}
                {(g.isDefault || g.ownPolicy) && (
                  <Link href={g.isDefault ? '/admin/leave/ledger' : `/admin/leave/ledger?pg=${g.id}`} className="inline-flex min-h-8 items-center rounded-button border border-border px-3 text-xs font-semibold text-text hover:bg-surface">
                    {t('seePolicy')}
                  </Link>
                )}
                {!g.isDefault && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'group.set', id: g.id, excluded: !g.excluded })}>
                    {t(g.excluded ? 'unexclude' : 'exclude')}
                  </Button>
                )}
                {!g.isDefault && g.members.length === 0 && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call({ action: 'group.set', id: g.id, active: false })}>
                    {t('remove')}
                  </Button>
                )}
              </span>
            </div>
            {!g.isDefault && g.members.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {g.members.map((m) => (
                  <li key={m.employeeId} className="inline-flex items-center gap-1 rounded-chip bg-surface px-2.5 py-1 text-xs">
                    {m.name} <span className="num text-faint">{t('since', { date: m.validFrom })}</span>
                    <button type="button" aria-label={t('takeOut', { name: m.name })} disabled={busy} onClick={() => call({ action: 'member.set', employeeId: m.employeeId, groupId: null, validFrom: today })} className="ml-1 text-faint hover:text-danger">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
        <form
          className="flex flex-col gap-2 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (await call({ action: 'group.add', name: f.get('name'), excluded: f.get('excluded') === 'on' })) e.currentTarget.reset();
          }}
        >
          <b>{t('addTitle')}</b>
          <input name="name" required minLength={1} maxLength={60} placeholder={t('name')} aria-label={t('name')} className={field} autoComplete="off" />
          <label className="flex min-h-9 items-center gap-2">
            <input name="excluded" type="checkbox" className="size-4 accent-primary" />
            {t('excludedLabel')}
          </label>
          <Button type="submit" size="sm" disabled={busy} className="self-start">
            {t('add')}
          </Button>
        </form>
        <form
          className="flex flex-col gap-2 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = String(f.get('group') ?? '');
            await call({ action: 'member.set', employeeId: f.get('employee'), groupId: g === def?.id || g === '' ? null : g, validFrom: f.get('validFrom') });
          }}
        >
          <b>{t('moveTitle')}</b>
          <select name="employee" required aria-label={t('employee')} className={field} defaultValue="">
            <option value="" disabled>
              {t('employee')}
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select name="group" required aria-label={t('group')} className={field} defaultValue={def?.id ?? ''}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('validFrom')}</span>
            <input name="validFrom" type="date" required defaultValue={today} className={field} />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="self-start">
            {t('move')}
          </Button>
          <p className="text-xs text-faint">{t('moveHint')}</p>
        </form>
      </div>
    </Card>
  );
}
