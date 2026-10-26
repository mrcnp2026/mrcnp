'use client';
// 백업으로 되돌리기 화면 (2026-10-25 의뢰인: 잘못된 수정을 백업으로 바로 되돌릴 수 있게 · 편하게).
// ① 되돌릴 표 고르기(묶음으로) → ② 백업과 지금 견주기 → ③ 방식 고르기 → ④ 확인 문구 입력 → 되돌리기. 되돌리기 직전의 상태는 자동으로 백업된다.
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle, Chip } from '@/components/ui';

type Err = { code: string; requestId?: string } | null;
type Contents = { createdAt: string; tables: { t: string; n: number }[] };
type Plan = { t: string; inBackup: number; now: number; deleted: number; changed: number; added: number };
type Mode = 'missing' | 'revert' | 'replace';
type Outcome = { before: { name: string }; done: { t: string; inserted: number; updated: number; removed: number }[]; orphans: { table: string; fk: string; orphans: number }[] };

const GROUPS: { key: string; test: (t: string) => boolean }[] = [
  { key: 'people', test: (t) => /^public\.(profiles|staff_|org_groups|jobs|invites|user_passkeys|signup_requests|role_change_requests|consents)/.test(t) },
  { key: 'attendance', test: (t) => /^public\.(punch_|shifts|shift_|day_confirms|attendance_|overtime_requests|work_rules|work_requests|office_|group_locations|holidays|missing)/.test(t) },
  { key: 'leave', test: (t) => /^public\.leave_/.test(t) },
  { key: 'payroll', test: (t) => /^public\.(payroll_|pay_|employee_pay)/.test(t) },
  { key: 'content', test: (t) => /^public\.(notice|board_|work_message|work_notes|content_images|training_)/.test(t) },
  { key: 'login', test: (t) => /^auth\./.test(t) },
];
const groupOf = (t: string) => GROUPS.find((g) => g.test(t))?.key ?? 'system';

export function RestorePanel({ name }: { name: string }) {
  const t = useTranslations('admin.backups');
  const [contents, setContents] = useState<Contents | null>(null);
  const [loadErr, setLoadErr] = useState<Err>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [plan, setPlan] = useState<Plan[] | null>(null);
  const [mode, setMode] = useState<Mode>('missing');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'plan' | 'restore' | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [out, setOut] = useState<Outcome | null>(null);

  useEffect(() => {
    let live = true;
    callApi<Contents>('/api/admin/backups/contents', { name }).then((r) => {
      if (!live) return;
      if (r.ok) setContents(r.data);
      else setLoadErr(r);
    });
    return () => { live = false; };
  }, [name]);

  const label = (tb: string) => (t.has(`tbl.${tb.replace('.', '_')}`) ? t(`tbl.${tb.replace('.', '_')}`) : tb.replace('public.', ''));
  const grouped = useMemo(() => {
    const m = new Map<string, { t: string; n: number }[]>();
    for (const x of contents?.tables ?? []) {
      if (!showEmpty && x.n === 0) continue; // 비어 있는 자료는 되돌릴 것이 없다
      if (q && !`${label(x.t)} ${x.t}`.toLowerCase().includes(q.toLowerCase())) continue;
      const k = groupOf(x.t);
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...GROUPS.map((g) => g.key), 'system'].filter((k) => m.has(k)).map((k) => ({ key: k, rows: m.get(k)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, q, showEmpty]);
  const emptyCount = (contents?.tables ?? []).filter((x) => x.n === 0).length;

  const toggle = (tb: string) => { setPlan(null); setOut(null); setPicked((s) => { const n = new Set(s); if (n.has(tb)) n.delete(tb); else n.add(tb); return n; }); };
  const toggleGroup = (rows: { t: string }[]) => { setPlan(null); setOut(null); setPicked((s) => { const n = new Set(s); const all = rows.every((r) => n.has(r.t)); for (const r of rows) { if (all) n.delete(r.t); else n.add(r.t); } return n; }); };

  const differs = plan?.filter((p) => p.deleted + p.changed + p.added > 0) ?? [];
  const effect = (p: Plan) => (mode === 'missing' ? p.deleted : mode === 'revert' ? p.deleted + p.changed : p.deleted + p.changed + p.added);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <CardTitle>① {t('step1')}</CardTitle>
        <p className="text-sm text-muted">{t('step1Note')}</p>
        {loadErr ? (
          <ErrorNote code={loadErr.code} requestId={loadErr.requestId} namespace="admin.backups" />
        ) : !contents ? (
          <p className="text-sm text-faint">{t('loading')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-sm lg:max-w-sm" />
              {emptyCount > 0 && (
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="size-5 accent-primary" />
                  {showEmpty ? t('showEmpty') : t('hiddenEmpty', { n: emptyCount })}
                </label>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {grouped.map((g) => {
                const all = g.rows.every((r) => picked.has(r.t));
                return (
                  <section key={g.key} className="flex flex-col gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-button bg-surface px-3 font-bold">
                      <input type="checkbox" checked={all} onChange={() => toggleGroup(g.rows)} className="size-5 accent-primary" />
                      {t(`group.${g.key}`)}
                      <span className="num text-xs font-normal text-muted">{t('groupCount', { n: g.rows.length })}</span>
                    </label>
                    {g.key === 'system' && <p className="px-1 text-xs text-muted">{t('groupNote.system')}</p>}
                    <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                      {g.rows.map((r) => (
                        <li key={r.t}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={picked.has(r.t)} onChange={() => toggle(r.t)} className="size-5 shrink-0 accent-primary" />
                            <span className="min-w-0 flex-1 truncate" title={r.t}>{label(r.t)}</span>
                            <span className="num text-xs text-muted">{t('rows', { n: r.n.toLocaleString() })}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            <p className="rounded-button bg-warn-tint p-3 text-xs text-warn">{t('linkedWarn')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={busy !== null || picked.size === 0}
                onClick={async () => {
                  setBusy('plan'); setErr(null); setOut(null); setPlan(null);
                  const r = await callApi<{ plan: Plan[] }>('/api/admin/backups/plan', { name, tables: [...picked] });
                  setBusy(null);
                  if (!r.ok) return setErr(r);
                  setPlan(r.data.plan);
                }}
              >
                {busy === 'plan' ? t('comparing') : t('compare', { n: picked.size })}
              </Button>
              {picked.size === 0 && <span className="text-sm text-faint">{t('pickFirst')}</span>}
            </div>
          </>
        )}
      </Card>

      {plan && (
        <Card className="flex flex-col gap-3">
          <CardTitle>② {t('step2')}</CardTitle>
          <p className="text-sm text-muted">{differs.length === 0 ? t('same') : t('differ', { n: differs.length })}</p>
          <ul className="flex flex-col divide-y divide-border">
            {plan.map((p) => {
              const diff = p.deleted + p.changed + p.added > 0;
              return (
                <li key={p.t} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className={`min-w-0 flex-1 font-semibold ${diff ? '' : 'text-faint'}`}>{label(p.t)}</span>
                  {diff ? (
                    <span className="num flex flex-wrap gap-1.5 text-xs">
                      {p.deleted > 0 && <Chip tone="danger">{t('deleted', { n: p.deleted })}</Chip>}
                      {p.changed > 0 && <Chip tone="warn">{t('changed', { n: p.changed })}</Chip>}
                      {p.added > 0 && <Chip tone="info">{t('added', { n: p.added })}</Chip>}
                    </span>
                  ) : (
                    <Chip tone="ok">{t('noDiff')}</Chip>
                  )}
                  <span className="num w-44 text-right text-xs text-muted">{t('backupVsNow', { a: p.inBackup.toLocaleString(), b: p.now.toLocaleString() })}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {plan && differs.length > 0 && (
        <Card className="flex flex-col gap-3">
          <CardTitle>③ {t('step3')}</CardTitle>
          <div className="flex flex-col gap-2">
            {(['missing', 'revert', 'replace'] as const).map((m) => (
              <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${mode === m ? 'border-primary bg-primary-tint' : 'border-border bg-bg'}`}>
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1 size-5 accent-primary" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-bold">{t(`mode.${m}`)}{m === 'missing' && <span className="ml-2 text-xs font-semibold text-ok">{t('safest')}</span>}</span>
                  <span className="text-sm text-muted">{t(`modeNote.${m}`)}</span>
                  <span className="num text-xs text-faint">{t('willChange', { n: differs.reduce((a, p) => a + (m === 'missing' ? p.deleted : m === 'revert' ? p.deleted + p.changed : p.deleted + p.changed + p.added), 0).toLocaleString() })}</span>
                </span>
              </label>
            ))}
          </div>
          <CardTitle>④ {t('step4')}</CardTitle>
          <p className="text-sm text-muted">{t('step4Note')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('confirmWord')} aria-label={t('confirmWord')} className="min-h-11 w-48 rounded-button border border-border bg-bg px-3 text-sm" autoComplete="off" />
            <Button
              type="button"
              variant="danger"
              disabled={busy !== null || confirm !== t('confirmWord') || differs.reduce((a, p) => a + effect(p), 0) === 0}
              onClick={async () => {
                setBusy('restore'); setErr(null); setOut(null);
                const r = await callApi<Outcome>('/api/admin/backups/restore', { name, tables: differs.map((p) => p.t), mode, confirm });
                setBusy(null);
                if (!r.ok) return setErr(r);
                setOut(r.data); setPlan(null); setConfirm('');
              }}
            >
              {busy === 'restore' ? t('restoring') : t('restoreDo')}
            </Button>
          </div>
        </Card>
      )}

      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.backups" />}

      {out && (
        <Card className="flex flex-col gap-3" data-restore-result>
          <CardTitle>{t('resultTitle')}</CardTitle>
          <p className="text-sm text-ok font-semibold">{t('resultOk')}</p>
          <p className="num text-xs text-muted">{t('resultBefore', { name: out.before.name })}</p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {out.done.map((d) => (
              <li key={d.t} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1 font-semibold">{label(d.t)}</span>
                <span className="num text-xs text-muted">{t('resultRow', { inserted: d.inserted, removed: d.removed })}</span>
              </li>
            ))}
          </ul>
          {out.orphans.length > 0 ? (
            <div className="rounded-button bg-danger-tint p-3 text-sm text-danger">
              <p className="font-bold">{t('orphanTitle')}</p>
              <ul className="pt-1">
                {out.orphans.map((o) => (
                  <li key={o.fk}>· {label(`public.${o.table.replace('public.', '')}`)} — {t('orphanRow', { n: o.orphans })}</li>
                ))}
              </ul>
              <p className="pt-1">{t('orphanFix')}</p>
            </div>
          ) : (
            <p className="text-sm text-ok">{t('noOrphan')}</p>
          )}
        </Card>
      )}
    </div>
  );
}
