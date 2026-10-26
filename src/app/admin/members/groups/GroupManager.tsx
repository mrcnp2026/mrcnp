'use client';
// 조직도 관리 — 최대 3단계(본부 › 부서 › 팀 같은 식). 추가 · 이름 바꾸기 · 삭제 (2026-10-25 의뢰인: 숨김이 아니라 삭제 / 하위로만이 아니라 같은 단계에도 추가 / 3단계).
// 줄마다 「같은 단계에 추가」 단추가 있고, 3단계가 아니면 「하위 조직 추가」도 있다. 단계 이름은 정해 두지 않는다(회사가 쓰는 이름을 그대로 적는다).
// 삭제는 쓰이지 않는 조직만 된다(직원 · 하위 조직 · 출퇴근 장소 · 지점관리자 범위가 없을 때) — 서버가 한 번 더 확인한다. 이미 숨겨 둔 조직은 아래에서 다시 쓰거나 지운다.
// 한 번에 하나만 편집한다 (어느 줄을 고치는지 헷갈리지 않게).
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card } from '@/components/ui';

export type GroupRow = { id: string; name: string; count: number; active: boolean };
/** 가지 모양 한 줄: count = 이 조직에 직접 속한 인원, total = 하위 조직까지 합친 인원 */
export type TreeRow = GroupRow & { total: number; children: TreeRow[] };

const MAX_DEPTH = 3;
// 같은 단계에 추가 = parentId 같은 곳, after = 그 줄 바로 아래에 입력 칸. parentId null = 맨 위 단계
type Edit = { mode: 'add'; parentId: string | null; after: string | null } | { mode: 'rename'; id: string } | { mode: 'delete'; id: string; name: string } | null;
const field = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base text-text';
const iconBtn = 'flex size-11 shrink-0 items-center justify-center rounded-button text-muted hover:bg-surface';
const addBtn = 'inline-flex min-h-11 items-center gap-1 rounded-button px-2 text-sm font-bold text-primary hover:bg-primary-tint';
const INDENT = ['pl-5', 'pl-9', 'pl-14'] as const;

export function GroupManager({ tree, hidden }: { tree: TreeRow[]; hidden: (GroupRow & { path: string })[] }) {
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

  const nameForm = (key: string, initial: string, onSave: (name: string) => void) => (
    <form
      key={key}
      className="flex items-center gap-2 px-5 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
        if (name) onSave(name);
      }}
    >
      <input name="name" required maxLength={40} defaultValue={initial} placeholder={t('orgName')} aria-label={t('orgName')} autoFocus className={field} autoComplete="off" />
      <Button type="submit" disabled={busy} className="min-h-11 shrink-0 px-3 text-sm">
        {t('save')}
      </Button>
      <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3 text-sm" onClick={() => setEdit(null)}>
        {t('cancel')}
      </Button>
    </form>
  );

  const confirmDelete = (g: { id: string; name: string }) => (
    <div key={`d${g.id}`} className="mx-3 my-1 flex flex-wrap items-center gap-2 rounded-card bg-warn-tint px-3 py-2 text-sm text-warn">
      <span className="min-w-0 flex-1">{t('deleteConfirm', { name: g.name })}</span>
      <Button type="button" size="sm" disabled={busy} onClick={() => run(`/api/admin/groups/${g.id}`, { delete: true })}>
        {t('deleteDo')}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setEdit(null)}>
        {t('cancel')}
      </Button>
    </div>
  );

  /** 한 줄 + 그 줄 아래 입력 칸(같은 단계 추가 · 하위 추가) + 하위 조직들(재귀) */
  const renderNode = (n: TreeRow, depth: number, parentId: string | null): React.ReactNode => (
    <div key={n.id}>
      {edit?.mode === 'rename' && edit.id === n.id ? (
        nameForm(`r${n.id}`, n.name, (name) => run(`/api/admin/groups/${n.id}`, { name }))
      ) : (
        <>
          <div className={`flex min-h-12 flex-wrap items-center gap-x-1 pr-2 ${INDENT[depth - 1]}`}>
            <span className={`min-w-0 flex-1 truncate ${depth === 1 ? 'font-bold' : ''}`}>{n.name}</span>
            <span className="num shrink-0 text-sm text-faint">{t('count', { n: n.total })}</span>
            <button type="button" className={iconBtn} aria-label={t('renameOf', { name: n.name })} onClick={() => start({ mode: 'rename', id: n.id })}>
              <Pencil aria-hidden size={18} strokeWidth={1.75} />
            </button>
            <button type="button" className={iconBtn} aria-label={t('deleteOf', { name: n.name })} disabled={busy} onClick={() => start({ mode: 'delete', id: n.id, name: n.name })}>
              <Trash2 aria-hidden size={18} strokeWidth={1.75} />
            </button>
          </div>
          {edit?.mode === 'delete' && edit.id === n.id && confirmDelete(n)}
          <div className={`flex flex-wrap items-center gap-x-1 pb-1 ${INDENT[Math.max(0, depth - 1)]}`}>
            <button type="button" className={addBtn} onClick={() => start({ mode: 'add', parentId, after: n.id })}>
              <Plus aria-hidden size={14} strokeWidth={2} />
              {t('addSame')}
            </button>
            {depth < MAX_DEPTH && (
              <button type="button" className={addBtn} onClick={() => start({ mode: 'add', parentId: n.id, after: null })}>
                <Plus aria-hidden size={14} strokeWidth={2} />
                {t('addChild')}
              </button>
            )}
          </div>
        </>
      )}
      {/* 같은 단계 추가 칸: 이 줄 바로 아래 */}
      {edit?.mode === 'add' && edit.after === n.id && nameForm(`a${n.id}`, '', (name) => run('/api/admin/groups', { name, ...(parentId ? { parentId } : {}) }))}
      {/* 하위 추가 칸: 하위 조직들 맨 앞 */}
      {edit?.mode === 'add' && edit.parentId === n.id && edit.after === null && nameForm(`c${n.id}`, '', (name) => run('/api/admin/groups', { name, parentId: n.id }))}
      {n.children.map((c) => renderNode(c, depth + 1, n.id))}
    </div>
  );

  return (
    <>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.org" />}
      {tree.length === 0 && <p className="px-1 text-muted">{t('empty')}</p>}
      {tree.map((d) => (
        <Card key={d.id} className="p-0 py-1">
          {renderNode(d, 1, null)}
        </Card>
      ))}

      <Card className="p-0 py-1">
        {edit?.mode === 'add' && edit.parentId === null && edit.after === null ? (
          nameForm('newTop', '', (name) => run('/api/admin/groups', { name }))
        ) : (
          <button type="button" onClick={() => start({ mode: 'add', parentId: null, after: null })} className="flex min-h-12 w-full items-center gap-1 px-5 font-bold text-primary">
            <Plus aria-hidden size={18} strokeWidth={2} />
            {t('addTop')}
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
              <li key={g.id}>
                <div className="flex min-h-12 items-center gap-1 pr-2 pl-5">
                  <span className="min-w-0 flex-1 truncate text-muted">{g.path}</span>
                  <button type="button" className={iconBtn} aria-label={t('restoreOf', { name: g.name })} disabled={busy} onClick={() => run(`/api/admin/groups/${g.id}`, { active: true })}>
                    <RotateCcw aria-hidden size={18} strokeWidth={1.75} />
                  </button>
                  <button type="button" className={iconBtn} aria-label={t('deleteOf', { name: g.name })} disabled={busy} onClick={() => start({ mode: 'delete', id: g.id, name: g.name })}>
                    <Trash2 aria-hidden size={18} strokeWidth={1.75} />
                  </button>
                </div>
                {edit?.mode === 'delete' && edit.id === g.id && confirmDelete(g)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
