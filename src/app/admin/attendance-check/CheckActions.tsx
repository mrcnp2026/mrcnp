'use client';
// 근태 점검 — 그 자리 처리 (결정 급여-71). 고를 것을 누르면 무엇이 바뀌는지 한 줄로 보여 주고, 실행하면 다시 계산한다.
// 확정된 날은 기록 · 휴가를 바꿀 수 없어서(DB가 막는다) 확정을 잠깐 풀고 처리한 뒤 다시 확정한다 — 담당자가 확정 화면을 따로 찾지 않게.
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import type { CheckKind, CheckState, MonthKind } from '@/lib/attendance-check';

type LeaveOpt = { code: string; name: string; hours: number };
export type DayCtx = {
  employeeId: string;
  date: string;
  confirmed: boolean;
  planStart: string | null;
  planEnd: string | null;
  // 늦은 · 이른 시간을 덮는 시간 휴가 — 짧은 것부터 (2026-11-04 의뢰인: 단추는 「무급휴가」 「연차」 두 개, 누르면 시간을 고른다)
  late: { minutes: number; unpaid: LeaveOpt[]; annual: LeaveOpt[] } | null;
  early: { minutes: number; unpaid: LeaveOpt[]; annual: LeaveOpt[] } | null;
  evening: { start: string; end: string } | null;
  breakSkip: { id: string; start: string; end: string } | null; // 직원이 퇴근할 때 「못 쉬었어요」라고 답한 것(대기)
  overtime: { id: string; status: string; needsReview: boolean; recomputed: number | null; approved: number; fact: number } | null; // fact = 집계(연장 + 휴일)
  extraOpen: boolean;
  kinds: CheckKind[];
  state: CheckState | null;
  base: boolean;
  live: boolean;
};
type Opt =
  | { k: 'lateUnpaid' | 'lateAnnual' | 'earlyUnpaid' | 'earlyAnnual'; leaves: LeaveOpt[] }
  | { k: 'lateAck' | 'notLate' | 'notEarly' | 'waive' | 'breakTaken' | 'accept' | 'notRecognized' | 'absentOk' | 'confirm' | 'skipApprove' | 'skipReject' };

const addMin = (hhmm: string, min: number) => { const [h, m] = hhmm.split(':').map(Number); const x = h * 60 + m + min; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Pills({ opts, pick, setPick, label, rec, recText }: { opts: Opt[]; pick: Opt | null; setPick: (o: Opt | null) => void; label: (o: Opt) => string; rec?: Opt['k']; recText: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button key={o.k} type="button" aria-pressed={pick?.k === o.k} onClick={() => setPick(pick?.k === o.k ? null : o)}
          className={`inline-flex min-h-11 min-w-22 items-center justify-center gap-1.5 rounded-chip border px-3.5 text-sm font-medium transition-colors lg:min-h-9 lg:min-w-32 ${pick?.k === o.k ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg text-text hover:border-primary/40 hover:bg-surface'}`}>
          {label(o)}
          {rec === o.k && <span className={`text-xs font-bold ${pick?.k === o.k ? 'text-on-primary' : 'text-primary'}`}>· {recText}</span>}
        </button>
      ))}
    </div>
  );
}

export function DayActions({ ctx, reviewId }: { ctx: DayCtx; reviewId: string | null }) {
  const t = useTranslations('admin.attendanceCheck.act');
  const tc = useTranslations('admin.attendanceCheck');
  const dur = (min: number) => (min >= 60 ? (min % 60 ? tc('hm', { h: Math.floor(min / 60), m: min % 60 }) : tc('h', { h: min / 60 })) : tc('min', { n: min }));
  const router = useRouter();
  const [pick, setPick] = useState<Opt | null>(null);
  const [hour, setHour] = useState(0); // 고른 시간 휴가(짧은 것부터 몇 번째)
  const leaveOf = (o: Extract<Opt, { leaves: LeaveOpt[] }>) => o.leaves[hour] ?? o.leaves[0];
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const has = (k: CheckKind) => ctx.kinds.includes(k);

  // 사유별로 묶는다 — 지각 단추와 연장 단추가 한 줄에 섞이면 어느 것이 무엇을 처리하는지 모른다 (2026-11-05 의뢰인)
  const groups: { g: 'late' | 'early' | 'break' | 'ot' | 'holiday' | 'day'; opts: Opt[]; rec?: Opt['k'] }[] = [];
  if (has('late_in') && ctx.late) {
    // 지각은 이미 늦은 만큼 자동으로 빠진다(급여-70) — 무급휴가로 덮으면 시간 단위라 더 빠질 수 있어 「확인」으로 (2026-11-04 의뢰인). 대장도 늦은 시간을 빼고 지급(26.10 3공장 10/6)
    const o: Opt[] = [{ k: 'lateAck' }, { k: 'notLate' }];
    if (ctx.late.annual.length) o.push({ k: 'lateAnnual', leaves: ctx.late.annual }); // 연차는 직원이 요청했을 때만 — 사유 필수
    groups.push({ g: 'late', opts: o, rec: 'lateAck' });
  }
  if (has('early_out') && ctx.early) {
    const o: Opt[] = [];
    if (ctx.early.unpaid.length) o.push({ k: 'earlyUnpaid', leaves: ctx.early.unpaid });
    o.push({ k: 'notEarly' });
    if (ctx.early.annual.length) o.push({ k: 'earlyAnnual', leaves: ctx.early.annual });
    groups.push({ g: 'early', opts: o });
  }
  if (has('break_request') && ctx.breakSkip) groups.push({ g: 'break', opts: [{ k: 'skipApprove' }, { k: 'skipReject' }] });
  if (has('break_check') && ctx.evening) groups.push({ g: 'break', opts: [{ k: 'waive' }, { k: 'breakTaken' }] }); // 권장 없음 — 저녁 휴게를 빼는 기준(잔업 길이)을 급여 담당에게 확인 중
  // 쉬는 날 근무는 「확인 완료」도 같은 칸에 — 따로 「처리」 칸을 두면 무엇을 확인하는지 모른다 (2026-11-05 의뢰인)
  const offDay = has('no_plan_work');
  if (ctx.extraOpen) {
    // 다시 계산해 늘어난 연장만 고를 것이 둘(승인 · 지급 안 함) — 회사는 15분 연장도 지급한다(26.08 · 26.10 대장).
    // 그 밖에는 「지급 안 함」 · 「확인 완료」가 같은 결과(승인한 시간만 지급, 그날을 처리됨으로)라 「확인 완료」 하나만 (2026-11-05 의뢰인)
    // 일부만 승인한 건도 남은 시간을 고른다 (2026-11-05 운영 정재호 10/6: 집계 3시간 15분 중 53분만 승인)
    const review = !!ctx.overtime && (ctx.overtime.needsReview || (ctx.overtime.status === 'approved' && ctx.overtime.approved < ctx.overtime.fact));
    groups.push({ g: offDay ? 'holiday' : 'ot', opts: review ? [{ k: 'accept' }, { k: 'notRecognized' }] : [{ k: 'confirm' }], rec: review ? 'accept' : undefined });
  }
  const day: Opt[] = [];
  if (has('missing_in')) day.push({ k: 'absentOk' });
  if (ctx.state === 'decide' && !ctx.extraOpen && (has('leave_day_punch') || offDay || (groups.length === 0 && day.length === 0))) day.push({ k: 'confirm' });
  if (day.length) groups.push({ g: 'day', opts: day });
  const blocked = ctx.state === 'block';
  const dayHref = `/admin/records/${ctx.employeeId}/${ctx.date}${ctx.live ? '' : ''}`;

  const otTo = ctx.overtime ? (ctx.overtime.needsReview ? ctx.overtime.recomputed ?? ctx.overtime.fact : ctx.overtime.fact) : 0; // 승인하면 될 시간 — 재확인이면 다시 계산한 값, 아니면 집계
  const label = (o: Opt) => {
    if ('leaves' in o) return t(o.k.endsWith('Unpaid') ? 'unpaidBtn' : 'annualBtn');
    if (o.k === 'accept' && ctx.overtime && otTo > ctx.overtime.approved) return t('acceptN', { d: dur(otTo - ctx.overtime.approved) });
    return t(o.k);
  };
  const will = (o: Opt) => {
    if ('leaves' in o) {
      const lv = leaveOf(o);
      const late = o.k.startsWith('late');
      const from = late ? ctx.planStart ?? '' : addMin(ctx.planEnd ?? '', -lv.hours * 60);
      return t('leaveWill', { name: lv.name, from, to: addMin(from, lv.hours * 60) });
    }
    if (o.k === 'lateAck') return t('lateAckWill', { d: dur(ctx.late?.minutes ?? 0) });
    if (o.k === 'accept') return t('acceptWill', { to: dur(otTo) });
    return t(`${o.k}Will`);
  };
  const needsWhy = (o: Opt) => o.k === 'notLate' || o.k === 'notEarly' || o.k === 'lateAnnual' || o.k === 'earlyAnnual'; // 연차는 직원 요청 내용을 남긴다

  async function run(o: Opt) {
    setBusy(true);
    setErr(null);
    const step = async (path: string, body: unknown) => { const r = await callApi(path, body); if (!r.ok) throw r; return r; };
    const unconfirm = ['lateUnpaid', 'lateAnnual', 'earlyUnpaid', 'earlyAnnual', 'waive', 'accept', 'skipApprove'].includes(o.k) && ctx.confirmed;
    try {
      if (unconfirm) await step('/api/admin/records/confirm', { confirm: false, items: [{ employeeId: ctx.employeeId, date: ctx.date }] });
      if ('leaves' in o) {
        const lv = leaveOf(o);
        const late = o.k.startsWith('late');
        const startTime = late ? ctx.planStart : addMin(ctx.planEnd ?? '', -lv.hours * 60);
        const reason = t(late ? (o.k === 'lateUnpaid' ? 'reasonLateUnpaid' : 'reasonLateAnnual') : o.k === 'earlyUnpaid' ? 'reasonEarlyUnpaid' : 'reasonEarlyAnnual');
        await step('/api/admin/leave/direct', { employeeId: ctx.employeeId, typeCode: lv.code, startDate: ctx.date, endDate: ctx.date, startTime, reason, adminReason: why.trim() || reason });
        await sleep(1200); // 연장 다시 계산(응답 뒤에 돈다)을 기다린다
      } else if (o.k === 'waive' && ctx.evening) {
        await step('/api/admin/break-waivers', { action: 'add', employeeId: ctx.employeeId, date: ctx.date, start: ctx.evening.start, end: ctx.evening.end, reason: why.trim() || t('reasonWaive') });
        await sleep(1200);
      } else if (o.k === 'skipApprove' && ctx.breakSkip) {
        // 직원 답 승인 = 그 휴게에 「휴게 안 함」 표시 → 답을 승인으로. 늘어난 연장은 이어서 「연장 승인」
        await step('/api/admin/break-waivers', { action: 'add', employeeId: ctx.employeeId, date: ctx.date, start: ctx.breakSkip.start, end: ctx.breakSkip.end, reason: why.trim() || t('reasonSkip') });
        await step('/api/admin/break-skip', { id: ctx.breakSkip.id, decision: 'approved' });
        await sleep(1200);
      } else if (o.k === 'skipReject' && ctx.breakSkip) {
        await step('/api/admin/break-skip', { id: ctx.breakSkip.id, decision: 'rejected' });
      } else if (o.k === 'accept' && ctx.overtime) {
        await step(`/api/admin/overtime/${ctx.overtime.id}/accept`, {});
      } else {
        const decision = { lateAck: 'confirmed', notLate: 'not_late', notEarly: 'not_late', breakTaken: 'break_taken', notRecognized: 'not_recognized', absentOk: 'confirmed', confirm: 'confirmed' }[o.k as 'notLate'] as string;
        // 고른 칸의 항목만 닫는다 — 지각 [무급]이 같은 날 연장 칸까지 닫지 않게 (2026-11-05 의뢰인)
        const g = groups.find((x) => x.opts.some((y) => y.k === o.k))?.g;
        const parts = g === 'late' ? ['late_in'] : g === 'early' ? ['early_out'] : g === 'break' ? ['break_check', 'break_request'] : g === 'ot' ? ['after_end'] : g === 'holiday' ? ['no_plan_work', 'after_end'] : ctx.kinds;
        await step('/api/admin/attendance-check', { action: 'decide', employeeId: ctx.employeeId, date: ctx.date, scope: 'day', kind: 'day', decision, note: why.trim() || null, parts });
      }
      if (unconfirm) await step('/api/admin/records/confirm', { confirm: true, items: [{ employeeId: ctx.employeeId, date: ctx.date }] }).catch(() => null); // 다시 확정 — 남은 대기 요청이 있으면 그날 상세에서
      setPick(null);
      setWhy('');
      router.refresh();
    } catch (e) {
      setErr(e as { code: string; requestId?: string });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pl-4">
      {reviewId && <p className="text-xs text-warn">{t('changedNote')}</p>}
      {blocked ? (
        <a href={has('pending_request') ? '/admin/inbox' : dayHref} className="inline-flex min-h-11 items-center self-start text-sm font-bold text-primary lg:min-h-9">
          {t(has('pending_request') ? 'goInbox' : 'goDay')} ›
        </a>
      ) : (
        <>
          {/* 근거 표(dl)와 같은 두 칸 — 왼쪽 이름이 위 「근무일정 · 출퇴근 기록」과 한 줄로 맞는다 */}
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
            {groups.map(({ g, opts, rec }) => (
              <div key={g + opts[0].k} className="contents">
                <span className="pt-2.5 text-xs font-semibold text-muted lg:pt-2">{t(`grp.${g}`)}</span>
                <div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-5">
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <Pills opts={opts} pick={pick} setPick={(o) => { setPick(o); setHour(0); setErr(null); }} label={label} rec={rec} recText={t('rec')} />
                    {(g === 'ot' || g === 'holiday') && ctx.overtime?.status === 'pending' && (
                      <a href={`/admin/inbox?k=overtime&id=${ctx.overtime.id}`} className="inline-flex min-h-11 items-center text-sm font-bold text-primary lg:min-h-9">{t('goOvertime')} ›</a>
                    )}
                  </div>
                  {/* 단추마다 무엇이 바뀌는지 늘 보이게 — 올려 보기 상자는 폰에서 안 보인다. 「남은 ○○ 승인 · 지급 안 함」은 이름으로 충분해서 뺀다 (2026-11-05 의뢰인) */}
                  {!opts.some((o) => o.k === 'accept') && (
                    <ul className="flex flex-col text-xs leading-5 text-muted">
                      {opts.map((o) => <li key={o.k}>{t(`hint.${o.k === 'confirm' && (g === 'ot' || g === 'holiday') ? 'confirmPaid' : o.k}`)}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
          {pick && (
            <div className="flex flex-col gap-2 rounded-button bg-surface/60 p-3 text-sm">
              {'leaves' in pick && (
                <div role="radiogroup" aria-label={t('hoursPick')} className="flex flex-wrap items-center gap-1.5">
                  <span className="pr-1 text-xs text-muted">{t('hoursPick')}</span>
                  {pick.leaves.map((lv, i) => (
                    <button key={lv.code} type="button" role="radio" aria-checked={leaveOf(pick).code === lv.code} onClick={() => setHour(i)}
                      className={`num min-h-11 rounded-chip border px-3 text-sm font-semibold lg:min-h-8 ${leaveOf(pick).code === lv.code ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-text hover:border-primary/40'}`}>
                      {t('hourOpt', { h: lv.hours })}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-muted">{will(pick)}{ctx.confirmed && ['lateUnpaid', 'lateAnnual', 'earlyUnpaid', 'earlyAnnual', 'waive', 'accept', 'skipApprove'].includes(pick.k) ? ` ${t('reconfirmNote')}` : ''}</p>
              {pick.k !== 'accept' && (
                <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} aria-label={t('reasonLabel')} placeholder={t(pick.k === 'lateAnnual' || pick.k === 'earlyAnnual' ? 'reasonAnnual' : needsWhy(pick) ? 'reasonNeeded' : 'reasonOptional')}
                  className="h-11 rounded-button border border-border bg-bg px-3 lg:h-9" />
              )}
              <Button type="button" size="sm" className="self-start" disabled={busy || (needsWhy(pick) && !why.trim())} onClick={() => run(pick)}>{t('do')}</Button>
            </div>
          )}
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.attendanceCheck.err" />}
        </>
      )}
    </div>
  );
}

export function MonthActions({ employeeId, month, kind, live }: { employeeId: string; month: string; kind: MonthKind; live: boolean }) {
  const t = useTranslations('admin.attendanceCheck.act');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const decision = kind === 'schedule_check' ? 'schedule_ok' : 'not_recognized';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/attendance-check', { action: 'decide', employeeId, date: `${month}-01`, scope: 'month', kind, decision, note: null });
        setBusy(false);
        if (!r.ok) return setErr(r);
        router.refresh();
      }}>{t(kind === 'schedule_check' ? 'scheduleOk' : 'earlyNotWork')}</Button>
      <a href={`/admin/shifts?m=${month}&e=${employeeId}${live ? '' : ''}`} className="inline-flex min-h-11 items-center text-sm font-bold text-primary lg:min-h-9">{t('goShifts')} ›</a>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.attendanceCheck.err" />}
    </div>
  );
}

export function ConfirmAll({ employeeId, month, n }: { employeeId: string; month: string; n: number }) {
  const t = useTranslations('admin.attendanceCheck.act');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  return (
    <div className="flex flex-col gap-1 pt-2">
      <Button type="button" size="sm" variant="outline" className="self-start" disabled={busy} onClick={async () => {
        setBusy(true);
        setErr(null);
        const r = await callApi('/api/admin/attendance-check', { action: 'confirmAll', employeeId, month });
        setBusy(false);
        if (!r.ok) return setErr(r);
        router.refresh();
      }}>{t('confirmAll', { n })}</Button>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.attendanceCheck.err" />}
    </div>
  );
}
