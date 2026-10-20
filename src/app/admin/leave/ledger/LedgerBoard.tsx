'use client';
// 휴가 원장 화면의 조작부 — 정책 시작/고치기 · 후보 만들기 · 승인/반려 · 소멸 처리 · 직접 지급. 처리하면 화면을 새로 읽는다.
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { Fold } from '@/components/Fold';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button, Card, CardTitle, Chip } from '@/components/ui';
import type { LeavePolicy } from '@/lib/leave-ledger';

export type LotLine = { id: string; employeeId: string; name: string; kind: string; grantedOn: string; usableFrom: string; usableTo: string | null; days: number; remaining: number | null; state: string; note: string | null; rule: string; years: number | null; month: number | null };
export type SettleLine = { id: string; retireOn: string; revision: number; state: string; unused: number; advance: number; hireBasis: number | null; granted: number; lots: { grantedOn: string; days: number }[]; payout: { state: 'OK' | 'NO_CONTRACT' | 'NO_HOURS'; amount: number | null; daily: number | null; hourly: number | null; items: string[]; unknown: string[] } | null };
export type BalanceLine = { advanceOver: boolean; employeeId: string; name: string; joinedOn: string | null; active: boolean; started: boolean; granted: number; used: number; expired: number; remaining: number; advance: number; upcoming: number; old: number | null };
export type EntryLine = { id: number; event: string; days: number; on: string; lot: string | null; fromRequest: boolean };
type Policy = { id: string; version: number; validFrom: string; verification: string; value: LeavePolicy };
type History = { version: number; validFrom: string; validTo: string | null; basis: string; reason: string | null };
type Res = { accrual?: { created: number; existing: number; noHireDate: number; excluded: number }; results?: { id: string; result: string }[]; expiry?: { expired: number; locked: number }; sync?: { added: number; locked: number }; carry?: { result: string; carried: number; expired: number }; settle?: string };

const field = 'min-h-9 rounded-button border border-border bg-bg px-3 text-sm';
function Table({ heads, children }: { heads: string[]; children: ReactNode }) {
  // 폰: 한 줄 = 한 카드(칸 이름을 앞에 붙여 세로로) — 옆으로 밀어 보던 표를 없앴다 (2026-10-16 디자인)
  const rows = Children.map(children, (row) => {
    if (!isValidElement<{ children?: ReactNode }>(row)) return row;
    let i = 0;
    return cloneElement(row, {}, Children.map(row.props.children, (cell) => (isValidElement(cell) ? cloneElement(cell as ReactElement<Record<string, unknown>>, { 'data-label': heads[i++] ?? '' }) : cell)));
  });
  return (
    <div className="overflow-x-auto table-ruled max-lg:px-3">
      <table className="w-full text-sm max-lg:[&_thead]:hidden">
        <thead>
          <tr className="border-b border-border bg-surface text-left">
            {heads.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-lg:[&_td]:flex max-lg:[&_td]:items-center max-lg:[&_td]:justify-between max-lg:[&_td]:gap-3 max-lg:[&_td]:px-1! max-lg:[&_td]:py-1! max-lg:[&_td]:text-right max-lg:[&_td]:before:shrink-0 max-lg:[&_td]:before:text-xs max-lg:[&_td]:before:text-faint max-lg:[&_td]:before:content-[attr(data-label)] max-lg:[&_td:empty]:hidden max-lg:[&_tr]:flex max-lg:[&_tr]:flex-col max-lg:[&_tr]:border-b max-lg:[&_tr]:border-border max-lg:[&_tr]:py-2">{rows}</tbody>
      </table>
    </div>
  );
}

export function LedgerBoard(props: { group?: { id: string; name: string } | null; today: string; live: boolean; practice: boolean; policy: Policy | null; history: History[]; candidates: LotLine[]; expiring: { id: string; name: string; usableTo: string; days: number; carry: number }[]; balances: BalanceLine[]; emp: { id: string; name: string; lots: LotLine[]; entries: EntryLine[]; settlements: SettleLine[] } | null }) {
  const t = useTranslations('admin.leaveLedger');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState(false);
  const { policy, candidates, emp } = props;
  const q = props.live ? '&live=1' : '';

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await callApi<Res>('/api/admin/leave/ledger', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    const d = r.data;
    if (d.accrual) setMsg(t('accrualDone', { created: d.accrual.created, existing: d.accrual.existing, noHire: d.accrual.noHireDate }));
    else if (d.expiry) setMsg(t('expiryDone', { n: d.expiry.expired, locked: d.expiry.locked }));
    else if (d.carry) setMsg(t(`carryResult.${d.carry.result}`, { carried: d.carry.carried / 480, expired: d.carry.expired / 480 }));
    else if (d.settle) setMsg(t(`settleResult.${d.settle}`));
    else if (d.sync) setMsg(t('syncDone', { n: d.sync.added, locked: d.sync.locked }));
    else if (d.results) {
      const n = (k: string) => d.results!.filter((x) => x.result === k).length;
      setMsg(t('decideDone', { ok: n('approved') + n('rejected') + n('withdrawn'), locked: n('locked'), inUse: n('in_use') }));
    } else setMsg(t('saved'));
    setPicked(new Set());
    setEdit(false);
    router.refresh();
    return true;
  };
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const why = (l: LotLine) => (l.rule === 'monthly' ? t('rule.monthly', { n: l.month ?? 0 }) : l.rule === 'annual' || l.rule === 'fiscal_annual' ? t(`rule.${l.rule}`, { n: l.years ?? 0 }) : t.has(`rule.${l.rule}`) ? t(`rule.${l.rule}`, { n: 0 }) : t('rule.manual', { n: 0 }));
  const range = (l: LotLine) => (l.usableTo ? t('range', { from: l.usableFrom, to: l.usableTo }) : t('rangeOpen', { from: l.usableFrom }));
  const r2 = (n: number) => Math.round(n * 100) / 100; // 화면은 소수 둘째 자리까지 (2026-10-19 의뢰인) // 비례 발생(10.9896)은 소수 둘째 자리까지
  const day = (n: number) => t('days', { n: r2(n) });

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card border border-border bg-surface p-3 text-sm text-muted">{t(props.practice ? 'stagePractice' : 'stage')}</p>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.leaveLedger" />}
      {msg && <p role="status" className="rounded-card border border-border bg-bg p-3 text-sm text-ok">{msg}</p>}


      {policy && (
        <Card>
          <CardTitle
            aside={
              <Button type="button" size="sm" disabled={busy} onClick={() => run({ action: 'accrue' })}>
                {t('accrue')}
              </Button>
            }
          >
            {t('candTitle', { n: candidates.length })}
          </CardTitle>
          <p className="pt-1 pb-3 text-sm text-faint">{t('candIntro')}</p>
          {candidates.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-3">
                <button type="button" onClick={() => setPicked(new Set(picked.size === candidates.length ? [] : candidates.map((c) => c.id)))} className="inline-flex min-h-9 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted">
                  {t('pickAll')}
                </button>
                <Button type="button" size="sm" disabled={busy || picked.size === 0} onClick={() => run({ action: 'decide', decision: 'approve', ids: [...picked] })}>
                  {t('approve', { n: picked.size })}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy || picked.size === 0} onClick={() => run({ action: 'decide', decision: 'reject', ids: [...picked] })}>
                  {t('reject', { n: picked.size })}
                </Button>
              </div>
              <Table heads={['', t('colName'), t('colWhy'), t('colDays'), t('colGranted'), t('colUsable')]}>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="w-10 px-3 py-2">
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={t('pick', { name: c.name })} className="size-5 accent-primary" />
                    </td>
                    <td className="px-3 py-2 font-bold">{c.name}</td>
                    <td className="px-3 py-2 text-muted">{why(c)}</td>
                    <td className="num px-3 py-2">{day(c.days)}</td>
                    <td className="num px-3 py-2 whitespace-nowrap">{c.grantedOn}</td>
                    <td className="num px-3 py-2 whitespace-nowrap">{range(c)}</td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>
      )}

      {props.expiring.length > 0 && (
        <Card>
          <CardTitle
            aside={
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'expire' })}>
                {t('expire', { n: props.expiring.length })}
              </Button>
            }
          >
            {t('expTitle', { n: props.expiring.length })}
          </CardTitle>
          <p className="pt-1 pb-3 text-sm text-faint">{t('expIntro')}</p>
          <Table heads={[t('colName'), t('colEnded'), t('colLeft'), t('colCarry')]}>
            {props.expiring.map((x) => (
              <tr key={x.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-bold">{x.name}</td>
                <td className="num px-3 py-2">{x.usableTo}</td>
                <td className="num px-3 py-2">{day(x.days)}</td>
                <td className="px-3 py-2">
                  {x.carry > 0 && (
                    <button type="button" disabled={busy} onClick={() => run({ action: 'carry', lotId: x.id })} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
                      {t('carryDo', { n: x.carry })}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <CardTitle>{t('balTitle')}</CardTitle>
        <p className="pt-1 pb-3 text-sm text-faint">{t('balIntro')}</p>
        {/* 폰: 한 사람 = 한 줄(이름 · 발생/사용 · 남은 연차 크게) — 누르면 그 사람 원장 (2026-10-16 디자인: 25명 카드로 7천 px였다) */}
        <ul className="-mx-1 flex flex-col divide-y divide-border lg:hidden">
          {props.balances.map((b) => (
            <li key={b.employeeId}>
              <Link href={`/admin/leave/ledger?emp=${b.employeeId}${q}#detail`} className="flex min-h-14 items-center gap-3 px-1 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">
                    {b.name}
                    {!b.active && <span className="ml-2 text-xs font-normal text-faint">{t('inactive')}</span>}
                  </span>
                  <span className="num truncate text-xs text-muted">{b.started ? t('balLine', { g: day(b.granted), u: day(b.used) }) : t('cmpNotStarted')}</span>
                </span>
                {b.started && b.old !== null && b.old !== b.remaining && <Chip tone="warn">{t('cmpDiff')}</Chip>}
                <span className="num shrink-0 text-right">
                  <span className={`block text-lg leading-tight font-bold ${b.remaining < 0 ? 'text-warn' : ''}`}>{b.started ? day(b.remaining) : '–'}</span>
                  {b.advance > 0 && <span className="block text-xs text-warn">{t(b.advanceOver ? 'advanceOver' : 'advance', { n: r2(b.advance) })}</span>}
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden lg:block">
        <Table heads={[t('colName'), t('colJoined'), t('colGrantedSum'), t('colUsed'), t('colExpired'), t('colRemaining'), t('colOld'), t('colCompare'), '']}>
          {props.balances.map((b) => (
            <tr key={b.employeeId} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 font-bold">
                {b.name}
                {!b.active && <span className="ml-2 text-xs text-faint">{t('inactive')}</span>}
              </td>
              <td className="num px-3 py-2 whitespace-nowrap">{b.joinedOn ?? <span className="text-warn">{t('noJoined')}</span>}</td>
              <td className="num px-3 py-2">{b.started ? day(b.granted) : ''}</td>
              <td className="num px-3 py-2">{b.started ? day(b.used) : ''}</td>
              <td className="num px-3 py-2">{b.started ? day(b.expired) : ''}</td>
              <td className="num px-3 py-2 font-bold">
                {b.started ? day(b.remaining) : ''}
                {b.advance > 0 && <span className="block text-xs font-normal text-warn">{t(b.advanceOver ? 'advanceOver' : 'advance', { n: r2(b.advance) })}</span>}
                {b.upcoming > 0 && <span className="block text-xs font-normal text-faint">{t('upcoming', { n: b.upcoming })}</span>}
              </td>
              <td className="num px-3 py-2">{b.old === null ? '' : day(b.old)}</td>
              <td className="px-3 py-2">{!b.started ? <Chip tone="neutral">{t('cmpNotStarted')}</Chip> : b.old === null ? <Chip tone="info">{t('cmpLedgerOnly')}</Chip> : b.old === b.remaining ? <Chip tone="ok">{t('cmpSame')}</Chip> : <Chip tone="warn">{t('cmpDiff')}</Chip>}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/leave/ledger?emp=${b.employeeId}${q}#detail`} className="font-bold text-primary hover:underline">
                  {t('detail')}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
        </div>
      </Card>

      {emp && (
        <Card>
          <div id="detail" />
          <CardTitle
            aside={
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'sync', employeeId: emp.id })}>
                {t('syncDo')}
              </Button>
            }
          >
            {t('empTitle', { name: emp.name })}
          </CardTitle>
          <div className="flex flex-col gap-4 pt-3">
            <Table heads={[t('colWhy'), t('colDays'), t('colLeft'), t('colGranted'), t('colUsable'), t('colState'), '']}>
              {emp.lots.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    {why(l)}
                    {l.note && <span className="block text-xs text-faint">{l.note}</span>}
                  </td>
                  <td className="num px-3 py-2">{day(l.days)}</td>
                  <td className="num px-3 py-2">{l.remaining === null ? '' : day(l.remaining)}</td>
                  <td className="num px-3 py-2 whitespace-nowrap">{l.grantedOn}</td>
                  <td className="num px-3 py-2 whitespace-nowrap">{range(l)}</td>
                  <td className="px-3 py-2">
                    <Chip tone={l.state === 'APPROVED' ? 'ok' : l.state === 'CANDIDATE' ? 'info' : 'neutral'}>{t(`state.${l.state}`)}</Chip>
                  </td>
                  <td className="px-3 py-2">
                    {(l.state === 'APPROVED' || l.state === 'CANDIDATE') && (
                      <button type="button" disabled={busy} onClick={() => run({ action: 'decide', decision: 'withdraw', ids: [l.id] })} className="inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50">
                        {t('withdraw')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {emp.lots.length === 0 && <p className="text-sm text-faint">{t('empNoLots')}</p>}
            <div>
              <p className="pb-2 text-sm font-bold">{t('entriesTitle')}</p>
              <Table heads={[t('colOn'), t('colEvent'), t('colChange'), t('colLot')]}>
                {emp.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="num px-3 py-2 whitespace-nowrap">{e.on}</td>
                    <td className="px-3 py-2">{t(`event.${e.event}`)}</td>
                    <td className={`num px-3 py-2 ${e.days < 0 ? 'text-warn' : 'text-ok'}`}>{t(e.days < 0 ? 'minus' : 'plus', { n: Math.abs(e.days) })}</td>
                    <td className="num px-3 py-2">{e.lot === null ? t('lotNone') : t('lotOf', { date: e.lot })}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm">
              <p className="font-bold">{t('settleTitle')}</p>
              <p className="text-xs text-faint">{t('settleHint')}</p>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run({ action: 'settle', employeeId: emp.id, retireOn: new FormData(e.currentTarget).get('retireOn') });
                }}
              >
                <label className="flex flex-col gap-1">
                  <span>{t('fRetireOn')}</span>
                  <input name="retireOn" type="date" required className={field} />
                </label>
                <Button type="submit" size="sm" variant="outline" disabled={busy}>
                  {t('settleMake')}
                </Button>
              </form>
              {emp.settlements.length > 0 && (
                <Table heads={[t('fRetireOn'), t('colUnused'), t('colPayout'), t('colAdvance'), t('colBasis'), t('colState'), '']}>
                  {emp.settlements.map((s) => (
                    <tr key={s.id} className="border-b border-border align-top">
                      <td className="num px-3 py-2 whitespace-nowrap">{s.retireOn}</td>
                      <td className="num px-3 py-2">
                        <span className="font-bold">{day(s.unused)}</span>
                        {s.lots.map((l) => (
                          <span key={l.grantedOn} className="block text-xs text-faint">
                            {t('settleLot', { date: l.grantedOn, n: r2(l.days) })}
                          </span>
                        ))}
                      </td>
                      {/* 남은 연차 수당 (2026-10-20): 1일 통상임금 × 남은 일수. 예전 정산(금액 없음)은 빈칸 */}
                      <td className="num px-3 py-2">
                        {!s.payout ? (
                          <span className="text-xs text-faint">{t('payoutOld')}</span>
                        ) : s.payout.state !== 'OK' ? (
                          <span className="text-xs text-warn">{t(`payoutState.${s.payout.state}`)}</span>
                        ) : (
                          <>
                            <span className="font-bold">{t('won', { n: s.payout.amount!.toLocaleString('ko-KR') })}</span>
                            <span className="block text-xs text-faint">{t('payoutDaily', { daily: s.payout.daily!.toLocaleString('ko-KR'), hourly: s.payout.hourly!.toLocaleString('ko-KR') })}</span>
                            {s.payout.items.length > 0 && <span className="block text-xs text-faint">{t('payoutItems', { items: s.payout.items.join(', ') })}</span>}
                            {s.payout.unknown.length > 0 && <span className="block text-xs text-warn">{t('payoutUnknown', { items: s.payout.unknown.join(', ') })}</span>}
                          </>
                        )}
                      </td>
                      <td className="num px-3 py-2">{s.advance > 0 ? <span className="text-warn">{day(s.advance)}</span> : day(0)}</td>
                      <td className="num px-3 py-2 text-xs">{s.hireBasis === null ? '' : <span className={s.hireBasis > s.granted ? 'text-warn' : 'text-faint'}>{t('settleBasis', { hire: s.hireBasis, got: s.granted })}</span>}</td>
                      <td className="px-3 py-2">
                        <Chip tone={s.state === 'APPROVED' ? 'ok' : s.state === 'CANDIDATE' ? 'info' : 'neutral'}>{t(`settleState.${s.state}`)}</Chip>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s.state === 'CANDIDATE' && (
                          <span className="flex gap-2">
                            <Button type="button" size="sm" disabled={busy} onClick={() => run({ action: 'settleDecide', id: s.id, decision: 'approve' })}>
                              {t('settleApprove')}
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'settleDecide', id: s.id, decision: 'reject' })}>
                              {t('settleReject')}
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
            <form
              className="grid gap-3 border-t border-border pt-3 text-sm md:grid-cols-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const el = e.currentTarget;
                const f = new FormData(el);
                if (await run({ action: 'manual', employeeId: emp.id, kind: f.get('kind'), days: f.get('days'), usableFrom: f.get('usableFrom'), usableTo: f.get('usableTo'), note: f.get('note') })) el.reset();
              }}
            >
              <p className="font-bold md:col-span-4">{t('manualTitle')}</p>
              <label className="flex flex-col gap-1">
                <span>{t('fKind')}</span>
                <select name="kind" className={field}>
                  {['manual', 'carry', 'compensatory', 'migrated'].map((k) => (
                    <option key={k} value={k}>
                      {t(`kind.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>{t('fDays')}</span>
                <input name="days" type="number" step="0.03125" min="0.03125" max="99" required className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span>{t('fFrom')}</span>
                <input name="usableFrom" type="date" defaultValue={props.today} required className={field} />
              </label>
              <label className="flex flex-col gap-1">
                <span>{t('fTo')}</span>
                <input name="usableTo" type="date" className={field} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span>{t('fNote')}</span>
                <input name="note" required minLength={2} maxLength={300} className={field} autoComplete="off" />
              </label>
              <div className="flex items-end">
                <Button type="submit" size="sm" disabled={busy}>
                  {t('manualSave')}
                </Button>
              </div>
              <p className="text-xs text-faint md:col-span-4">{t('manualHint')}</p>
            </form>
          </div>
        </Card>
      )}
      {/* 연차 생성 기준 — 자주 바꾸지 않으므로 맨 아래에 접어 둔다 (2026-10-16 디자인: 잔여부터 보이게) */}
      <Fold title={props.group ? t('policyTitleGroup', { name: props.group.name }) : t('policyTitle')} summary={policy ? `${t(policy.verification === 'VERIFIED' ? 'verified' : 'temporary')} · ${policy.validFrom}` : t('policyNone')} aside={policy ? <Chip tone={policy.verification === 'VERIFIED' ? 'ok' : 'warn'}>{t(policy.verification === 'VERIFIED' ? 'verified' : 'temporary')}</Chip> : undefined} open={!policy}>
        {!policy ? (
          <div className="flex flex-col items-start gap-3 pt-3">
            <p className="text-sm text-muted">{t('policyNone')}</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => run({ action: 'seed', groupName: t('defaultGroup') })}>
              {t('seed')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-3 text-sm">
            <ul className="flex flex-col gap-1 text-muted">
              <li>{t(policy.value.basis === 'hire_date' ? 'basisHire' : 'basisFiscal', { start: policy.value.fiscalStart })}</li>
              <li>{t('ruleFirstYear', { max: policy.value.monthlyMax })}</li>
              <li>{t('ruleAnnual', { base: policy.value.baseDays, every: policy.value.extraEveryYears, max: policy.value.maxDays })}</li>
              <li>{t('ruleDay', { hours: policy.value.dayMinutes / 60 })}</li>
              <li>{policy.value.carryMaxDays > 0 ? t('ruleCarry', { max: policy.value.carryMaxDays, months: policy.value.carryValidMonths }) : t('ruleCarryNone')}</li>
              <li>{policy.value.advanceMaxDays > 0 ? t('ruleAdvance', { max: policy.value.advanceMaxDays }) : t('ruleAdvanceNone')}</li>
              <li className="num text-faint">{t('policyVersion', { n: policy.version, from: policy.validFrom })}</li>
            </ul>
            <p className="text-xs text-faint">{t('policyCaveat')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEdit(!edit)}>
                {t('policyEdit')}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run({ action: 'verify', id: policy.id, state: policy.verification === 'VERIFIED' ? 'TEMPORARY' : 'VERIFIED' })}>
                {t(policy.verification === 'VERIFIED' ? 'markTemporary' : 'markVerified')}
              </Button>
            </div>
            {edit && (
              <form
                className="grid gap-3 border-t border-border pt-3 md:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await run({ action: 'policy', groupId: props.group?.id ?? null, expectedVersion: policy.version, validFrom: f.get('validFrom'), reason: f.get('reason'), policy: { ...policy.value, basis: f.get('basis'), fiscalStart: f.get('fiscalStart'), rounding: f.get('rounding'), carryMaxDays: Number(f.get('carryMaxDays')), carryValidMonths: Number(f.get('carryValidMonths')), advanceMaxDays: Number(f.get('advanceMaxDays')) } });
                }}
              >
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fBasis')}</span>
                  <select name="basis" defaultValue={policy.value.basis} className={field}>
                    <option value="hire_date">{t('optHire')}</option>
                    <option value="fiscal_year">{t('optFiscal')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fFiscalStart')}</span>
                  <input name="fiscalStart" defaultValue={policy.value.fiscalStart} pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])" required className={field} autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fRounding')}</span>
                  <select name="rounding" defaultValue={policy.value.rounding} className={field}>
                    <option value="ceil_day">{t('optCeilDay')}</option>
                    <option value="ceil_half">{t('optCeilHalf')}</option>
                    <option value="none">{t('optNone')}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fCarryMax')}</span>
                  <input name="carryMaxDays" type="number" min="0" max="60" step="0.5" defaultValue={policy.value.carryMaxDays} required className={field} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fCarryMonths')}</span>
                  <input name="carryValidMonths" type="number" min="1" max="36" step="1" defaultValue={policy.value.carryValidMonths} required className={field} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fAdvanceMax')}</span>
                  <input name="advanceMaxDays" type="number" min="0" max="60" step="0.5" defaultValue={policy.value.advanceMaxDays} required className={field} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-bold">{t('fValidFrom')}</span>
                  <input name="validFrom" type="date" defaultValue={props.today} required className={field} />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-bold">{t('fReason')}</span>
                  <input name="reason" required minLength={2} maxLength={500} className={field} autoComplete="off" />
                </label>
                <p className="text-xs text-faint md:col-span-2">{t('policyEditHint')}</p>
                <div className="md:col-span-2">
                  <Button type="submit" size="sm" disabled={busy}>
                    {t('policySave')}
                  </Button>
                </div>
              </form>
            )}
            {props.history.length > 0 && (
              <ul className="num flex flex-col gap-1 border-t border-border pt-3 text-xs text-faint">
                {props.history.map((h) => (
                  <li key={h.version}>{t('historyLine', { n: h.version, from: h.validFrom, to: h.validTo ?? '', basis: t(h.basis === 'hire_date' ? 'optHire' : 'optFiscal'), reason: h.reason ?? '' })}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Fold>
    </div>
  );
}
