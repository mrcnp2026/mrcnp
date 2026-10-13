'use client';
// 지점관리자가 맡는 지점 고르기 — 고른 지점의 직원만 그 사람에게 보인다. 부서를 고르면 그 밑의 팀도 포함된다.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';

export function ManagerScope({ employeeId, groups, picked }: { employeeId: string; groups: { id: string; label: string }[]; picked: string[] }) {
  const t = useTranslations('admin.manage');
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(picked));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const toggle = (id: string) => {
    setDone(false);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
      <p className="font-bold">{t('scopeTitle')}</p>
      <p className="text-sm text-muted">{t('scopeHint')}</p>
      {groups.length === 0 && <p className="text-sm text-warn">{t('scopeNoGroups')}</p>}
      <ul className="flex flex-col gap-1">
        {groups.map((g) => (
          <li key={g.id}>
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={sel.has(g.id)} onChange={() => toggle(g.id)} className="size-5 accent-primary" />
              {g.label}
            </label>
          </li>
        ))}
      </ul>
      {sel.size === 0 && <p className="text-sm text-warn">{t('scopeEmpty')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.manage" />}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await callApi(`/api/admin/employees/${employeeId}/manager-scope`, { groupIds: [...sel] });
            setBusy(false);
            if (!r.ok) return setErr(r);
            setDone(true);
            router.refresh();
          }}
        >
          {t('scopeSave')}
        </Button>
        {done && <span role="status" className="text-sm text-ok">{t('scopeSaved')}</span>}
      </div>
    </div>
  );
}
