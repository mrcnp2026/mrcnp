'use client';
// 인사 변동 이력 — 한 쪽(15줄)의 목록과 「기록 글」 선택 삭제 (2026-10-25 의뢰인: 한 화면에 너무 많다 → 쪽 넘김, 선택 삭제).
// 지울 수 있는 것은 직원 상세 「인사 기록」에 남긴 글(기록)뿐이다 — 숨기기만 하고 변경 기록에는 남는다.
// 퇴사 · 복직 · 권한 · 입사일 · 내려받기는 증빙이라 지우지 못한다(체크칸이 없다).
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { Chip } from '@/components/ui';

export type HrRowView = { key: string; noteId: string | null; employeeId: string; name: string; employeeNo: string | null; group: string; joinedOn: string | null; kind: 'resign' | 'reinstate' | 'note' | 'role' | 'joined' | 'download'; on: string | null; reason: string | null; actor: string | null };
const TONE = { resign: undefined, reinstate: 'ok', note: 'info', role: 'warn', joined: 'warn', download: undefined } as const;

export function HrLogTable({ rows }: { rows: HrRowView[] }) {
  const t = useTranslations('admin.resignLog');
  const router = useRouter();
  const [sel, setSel] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [res, setRes] = useState<{ done: number; failed: number } | null>(null);
  const deletable = rows.filter((r) => r.noteId);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const check = (r: HrRowView) =>
    r.noteId ? (
      <input type="checkbox" checked={sel.includes(r.noteId)} onChange={() => { toggle(r.noteId!); setAsking(false); setRes(null); }} aria-label={t('selectOne', { name: r.name })} className="size-5 accent-primary lg:size-4" />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {deletable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="inline-flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={sel.length > 0 && sel.length === deletable.length} onChange={(e) => { setSel(e.target.checked ? deletable.map((r) => r.noteId!) : []); setAsking(false); setRes(null); }} aria-label={t('selectAllNotes')} className="size-5 accent-primary lg:size-4" />
            {t('selectAllNotes')}
          </label>
          {asking ? (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-card bg-warn-tint px-3 py-1.5 text-warn">
              {t('deleteConfirm', { n: sel.length })}
              <Button type="button" size="sm" disabled={busy} onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await callApi<{ done: number; failed: number }>('/api/admin/hr-log/notes', { ids: sel });
                setBusy(false);
                setAsking(false);
                if (!r.ok) return setErr(r);
                setRes(r.data);
                setSel([]);
                router.refresh();
              }}>
                {t('deleteDo')}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsking(false)}>{t('cancel')}</Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={sel.length === 0} onClick={() => setAsking(true)}>{t('deleteSelected', { n: sel.length })}</Button>
          )}
          {res && <span role="status" className={res.failed ? 'text-warn' : 'text-ok'}>{t('deleteResult', { done: res.done, failed: res.failed })}</span>}
        </div>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.resignLog" />}

      {rows.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-center text-sm text-faint">{t('empty')}</p>
      ) : (
        <>
          {/* 폰: 한 건씩 카드 */}
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-bg lg:hidden">
            {rows.map((r) => (
              <li key={r.key} className="flex items-start gap-3 px-3 py-3">
                <span className="flex min-h-6 w-5 shrink-0 items-center pt-0.5">{check(r)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone={TONE[r.kind]}>{t(r.kind)}</Chip>
                    <Link href={`/admin/members/${r.employeeId}`} className="font-bold">{r.name}</Link>
                    <span className="num text-xs text-muted">{r.on ?? ''}</span>
                  </span>
                  {r.reason && <span className="text-sm break-words whitespace-pre-line">{r.reason}</span>}
                  {!r.reason && !r.on && <span className="text-sm text-faint">{t('noRecord')}</span>}
                  <span className="text-xs text-faint">{[r.actor ? t('by', { name: r.actor }) : null, r.group].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* PC: 표 */}
          <div className="hidden table-ruled lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left">
                  <th scope="col" className="w-10 px-3 py-2.5" />
                  {['colKind', 'colName', 'colOn', 'colReason', 'colActor', 'colGroup'].map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border align-top last:border-b-0">
                    <td className="px-3 py-3">{check(r)}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><Chip tone={TONE[r.kind]}>{t(r.kind)}</Chip></td>
                    <td className="px-3 py-3 whitespace-nowrap"><Link href={`/admin/members/${r.employeeId}`} className="font-bold hover:text-primary">{r.name}</Link><span className="num pl-2 text-xs text-muted">{r.employeeNo}</span></td>
                    <td className="num px-3 py-3 whitespace-nowrap">{r.on ?? ''}</td>
                    <td className="max-w-md px-3 py-3 break-words whitespace-pre-line">{r.reason ?? (r.on ? '' : t('noRecord'))}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{r.actor ?? ''}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">{r.group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
