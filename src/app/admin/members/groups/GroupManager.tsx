'use client';
// 조직도 관리 — 부서 › 팀 2단계. 추가·이름 바꾸기·숨기기. 지우지 않는다 (숨긴 그룹은 아래에서 다시 쓸 수 있다).
// 한 번에 하나만 편집한다 (어느 줄을 고치는지 헷갈리지 않게).
import { EyeOff, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

export type GroupRow = { id: string; name: string; count: number; active: boolean };
export type DeptRow = GroupRow & { total: number; teams: GroupRow[] };

type Edit = { mode: 'addDept' } | { mode: 'addTeam'; parentId: string } | { mode: 'rename'; id: string; name: string } | null;
const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';
const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-button text-muted';

export function GroupManager({ depts, hidden }: { depts: DeptRow[]; hidden: (GroupRow & { path: string })[] }) {
  const t = useTranslations('admin.org');
  const router = useRouter();
  const [edit, setEdit] = useState<Edit>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const run = async (path: string, body: unknown) => {
    setBusy(true);
    setErr(null);
    const r = await callApi(path, body);
    setBusy(false);
    if (!r.ok) return setErr(r);
    setEdit(null);
    router.refresh();
  };
  const start = (e: Edit) => {
    setErr(null);
    setEdit(e);
  };

  const nameForm = (key: string, placeholder: string, initial: string, onSave: (name: string) => void) => (
    <form
      key={key}
      className="flex items-center gap-2 px-5 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
        if (name) onSave(name);
      }}
    >
      <input name="name" required maxLength={40} defaultValue={initial} placeholder={placeholder} aria-label={placeholder} autoFocus className={field} autoComplete="off" />
      <Button type="submit" disabled={busy} className="min-h-11 shrink-0 px-3 text-sm">
        {t('save')}
      </Button>
      <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3 text-sm" onClick={() => setEdit(null)}>
        {t('cancel')}
      </Button>
    </form>
  );

  const line = (g: GroupRow, isTeam: boolean) =>
    edit?.mode === 'rename' && edit.id === g.id ? (
      nameForm(`r${g.id}`, t(isTeam ? 'teamName' : 'deptName'), g.name, (name) => run(`/api/admin/groups/${g.id}`, { name }))
    ) : (
      <div className={`flex min-h-12 items-center gap-1 pr-2 ${isTeam ? 'pl-9' : 'pl-5'}`}>
        <span className={`min-w-0 flex-1 truncate ${isTeam ? '' : 'font-bold'}`}>{g.name}</span>
        <span className="num shrink-0 text-sm text-faint">{t('count', { n: g.count })}</span>
        <button type="button" className={iconBtn} aria-label={t('renameOf', { name: g.name })} onClick={() => start({ mode: 'rename', id: g.id, name: g.name })}>
          <Pencil aria-hidden size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className={iconBtn} aria-label={t('hideOf', { name: g.name })} disabled={busy} onClick={() => run(`/api/admin/groups/${g.id}`, { active: false })}>
          <EyeOff aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
    );

  return (
    <>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.org" />}
      {depts.length === 0 && <p className="px-1 text-muted">{t('empty')}</p>}
      {depts.map((d) => (
        <Card key={d.id} className="p-0 py-1">
          {line({ ...d, count: d.total }, false)}
          <ul>
            {d.teams.map((x) => (
              <li key={x.id}>{line(x, true)}</li>
            ))}
          </ul>
          {edit?.mode === 'addTeam' && edit.parentId === d.id ? (
            nameForm(`t${d.id}`, t('teamName'), '', (name) => run('/api/admin/groups', { name, parentId: d.id }))
          ) : (
            <button type="button" onClick={() => start({ mode: 'addTeam', parentId: d.id })} className="flex min-h-11 items-center gap-1 pl-9 text-sm font-bold text-primary">
              <Plus aria-hidden size={16} strokeWidth={2} />
              {t('addTeam')}
            </button>
          )}
        </Card>
      ))}

      <Card className="p-0 py-1">
        {edit?.mode === 'addDept' ? (
          nameForm('newDept', t('deptName'), '', (name) => run('/api/admin/groups', { name }))
        ) : (
          <button type="button" onClick={() => start({ mode: 'addDept' })} className="flex min-h-12 w-full items-center gap-1 px-5 font-bold text-primary">
            <Plus aria-hidden size={18} strokeWidth={2} />
            {t('addDept')}
          </button>
        )}
      </Card>

      {hidden.length > 0 && (
        <details className="rounded-card bg-bg">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-5 text-sm text-muted">
            <span>{t('hiddenTitle')}</span>
            <span className="num text-faint">{hidden.length}</span>
          </summary>
          <ul className="pb-1">
            {hidden.map((g) => (
              <li key={g.id} className="flex min-h-12 items-center gap-1 pr-2 pl-5">
                <span className="min-w-0 flex-1 truncate text-muted">{g.path}</span>
                <button type="button" className={iconBtn} aria-label={t('restoreOf', { name: g.name })} disabled={busy} onClick={() => run(`/api/admin/groups/${g.id}`, { active: true })}>
                  <RotateCcw aria-hidden size={18} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
