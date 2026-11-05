// 급여대장(회사 양식) 자료 — 엑셀(run-export)과 PDF(ledger-pdf)가 같은 숫자를 쓰게 한곳에서 만든다 (2026-11-05 의뢰인: 「26.10 김해3공장 급여대장」 양식).
// ★ 돈은 저장된 명세서 항목 그대로. 날짜표는 마감한 근태를 다시 읽어 보여 주는 것이고, 합계가 명세서 시간과 다르면 mismatch에 적는다.
// ★ 조기(대장 「조기」)는 근무 틀이 회사 시작보다 이른 사람의 그 사이 시간 — 돈은 연장과 같은 배율이라 연장에서 떼어 보여 주기만 한다.
import 'server-only';
import { resolveDayType } from '@/config/labor-rules';
import { addDays } from '@/lib/calendar';
import { leaveByDate } from '@/lib/leave';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { restAndHolidayMinutes } from './engine/weekly-rest';
import type { RunRow } from './run-data';

type Row = Record<string, unknown>;
export type LeaveTone = 'annual' | 'out' | 'family' | 'sick';
export type DayCell = { base: number; early: number; ot: number; hol: number; hol8: number; rest: number; ph: number; leave: { label: string; tone: LeaveTone } | null }; // 분
export type TimeLine = { label: string; qty: number | null; rate: number | null; factor: number | null; amt: number };
export type LedgerPerson = {
  id: string; name: string; group: string; ok: boolean; reason: string; payType: string; closed: boolean;
  pay: number | null; deduction: number | null; net: number | null; employer: number | null;
  grid: Map<string, DayCell>; lines: TimeLine[]; timeSum: number; extras: { label: string; amount: number; note: string }[]; extraSum: number; deductions: { label: string; amount: number }[];
};
export type LedgerItem = { person: string; group: string; label: string; kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER'; qty: number | null; unit: number | null; factor: number | null; amount: number; how: string; source: string };
export type Ledger = {
  year: string; mon: string; last: string; draft: boolean; days: string[]; halves: string[][];
  isRed: (d: string) => boolean; isSat: (d: string) => boolean;
  people: LedgerPerson[]; items: LedgerItem[]; mismatch: string[];
  sums: { pay: number; deduction: number; net: number; employer: number; itemPay: number; itemDeduction: number; ok: number; blocked: number };
};
export type LedgerLabels = { line: (code: string, fallback: string) => string; blocker: (code: string) => string; manual: string; override: string };

export const hm = (min: number) => Math.round((min / 60) * 100) / 100;
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const kstMin = (d: Date) => { const s = new Date(d.getTime() + 9 * 3600e3).toISOString(); return +s.slice(11, 13) * 60 + +s.slice(14, 16); };
export const payTypeKo = (t: string) => (t === 'HOURLY' ? '시급제' : t === 'MONTHLY' ? '월급제' : t === 'ANNUAL' ? '연봉제' : t === 'DAILY' ? '일용직' : '');

const TIME_CODES = new Set(['BASE', 'BASE_PAY', 'PAID_LEAVE', 'OVERTIME', 'OVERTIME_PAY', 'NIGHT', 'NIGHT_PAY', 'HOLIDAY', 'HOLIDAY_PAY', 'HOLIDAY_OVER8', 'WEEKLY_REST', 'PAID_HOLIDAY']);

export async function loadLedger(run: RunRow, L: LedgerLabels): Promise<Ledger> {
  const c = createAdminClient();
  const ym = run.periodFrom.slice(0, 7);
  const last = addDays(run.periodTo, -1); // period_to는 다음 달 1일
  const [{ data: sts }, { data: profiles }, { data: groups }, period] = await Promise.all([
    run.generationId ? c.from('payroll_statements').select('*').eq('generation_id', run.generationId) : Promise.resolve({ data: [] as Row[] }),
    c.from('profiles').select('id, name, group_id'),
    c.from('org_groups').select('id, name'),
    loadPeriod(run.periodFrom, last, run.isTest),
  ]);
  const groupName = (id: unknown) => ((groups ?? []).find((g) => g.id === id)?.name as string | undefined) ?? '';
  const list = ((sts ?? []) as Row[]).map((s) => ({ s, p: (profiles ?? []).find((x) => x.id === s.employee_id) as Row | undefined })).sort((a, b) => String(a.p?.name ?? '').localeCompare(String(b.p?.name ?? '')));
  const ids = list.map((x) => x.s.id as string);
  const raw: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await c.from('payroll_statement_items').select('*').in('statement_id', ids.slice(i, i + 200)).order('line_no');
    raw.push(...((data ?? []) as Row[]));
  }
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const nameOf = (i: Row) => L.line(String(i.item_code).replace(/_EMPLOYER$/, ''), String(i.label_ko ?? i.item_code));
  const days: string[] = [];
  for (let d = run.periodFrom; d <= last; d = addDays(d, 1)) days.push(d);
  const wd = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const dayTypeOf = (d: string) => { const r = period.ruleAt(d); return r ? resolveDayType(d, r, period.holidays) : 'workday'; };
  const mismatch: string[] = [];
  const items: LedgerItem[] = [];

  const people = list.map(({ s, p }): LedgerPerson => {
    const empId = s.employee_id as string;
    const nm = (p?.name as string) ?? '';
    const group = groupName(p?.group_id);
    const payType = String(((s.snapshot as Row | null)?.contract as Row | null)?.payType ?? '');
    const ok = s.state === 'OK';
    const reason = ((s.blockers ?? []) as { code: string; warning?: boolean }[]).filter((b) => !b.warning).map((b) => L.blocker(b.code).replace(/\.$/, '')).join(' · ');
    const mine = raw.filter((i) => i.statement_id === s.id);
    for (const i of mine) {
      const q = n(i.quantity), u = n(i.unit_price), f = n(i.factor);
      const tr = (i.calc_trace ?? {}) as Row;
      const how = q !== null && u !== null ? `${q.toLocaleString('ko-KR')}${i.kind === 'PAYMENT' ? '시간' : ''} × ${u.toLocaleString('ko-KR')}원${f !== null && f !== 1 ? ` × ${f}` : ''}` : typeof tr.base === 'number' && typeof tr.rate === 'number' ? `${(tr.base as number).toLocaleString('ko-KR')}원 × ${tr.rate}` : '';
      items.push({ person: nm, group, label: nameOf(i), kind: i.kind as LedgerItem['kind'], qty: q, unit: u, factor: f, amount: Number(i.amount), how, source: String(i.source) });
    }
    const empty = { id: empId, name: nm, group, ok, reason, payType, closed: !!s.close_id, pay: n(s.pay_total), deduction: n(s.deduction_total), net: n(s.net_total), employer: n(s.employer_total), grid: new Map(), lines: [], timeSum: 0, extras: [], extraSum: 0, deductions: [] };
    if (!ok) return empty;

    // 날마다: 기본 · 조기 · 연장 · 휴일 · 휴일연장 · 주차 · 유휴 + 휴가 표시
    const hourly = payType === 'HOURLY';
    const rows = new Map(daysFor(period, empId, run.periodFrom, last).map((d) => [d.workDate, d]));
    const ots = new Map(period.overtime.filter((o) => o.employeeId === empId && o.status === 'approved').map((o) => [o.workDate, o]));
    const leaves = leaveByDate({ requests: period.leaveRequests.filter((r) => r.employeeId === empId && r.status === 'approved'), types: period.leaveTypes, dayTypeOf, from: run.periodFrom, to: last });
    const rest = hourly ? restAndHolidayMinutes({ from: run.periodFrom, last, ruleAt: (d) => period.ruleFor(empId, d) ?? period.rule, holidays: period.holidays }) : { weeklyRestDays: [] as string[], paidHolidays: [] as string[] };
    const grid = new Map<string, DayCell>();
    for (const d of days) {
      const row = rows.get(d);
      const o = ots.get(d);
      const otMin = o ? (o.approvedMinutes ?? o.overtimeMinutes) : 0;
      const holMin = o ? (o.approvedHolidayMinutes ?? o.holidayMinutes) : 0;
      let early = 0;
      const plan = period.planFor(empId, d).rule;
      const baseStart = period.ruleAt(d)?.startTime;
      const pairs = (row?.pairs ?? []).filter((x) => x.in && x.out);
      if (plan && baseStart && toMin(plan.startTime) < toMin(baseStart) && pairs.length && dayTypeOf(d) === 'workday') {
        const from = Math.max(toMin(plan.startTime), Math.min(...pairs.map((x) => kstMin(x.in!))));
        const to = Math.min(toMin(baseStart), Math.max(...pairs.map((x) => kstMin(x.out!))));
        early = Math.min(otMin, Math.max(0, to - from));
      }
      const lv = leaves.get(d)?.filter((x) => x.isPaid) ?? [];
      const lvMin = Math.min(480, Math.round(lv.reduce((a, x) => a + x.unit, 0) * 480));
      const lvName = lv.map((x) => period.leaveTypes.find((t) => t.code === x.typeCode)?.name ?? '').filter(Boolean)[0] ?? '';
      const tone: LeaveTone = /병가|하계|포상/.test(lvName) ? 'sick' : /경조/.test(lvName) ? 'family' : /외출|조퇴/.test(lvName) ? 'out' : 'annual';
      grid.set(d, {
        base: (row?.regularMinutes ?? 0) + lvMin, early, ot: otMin - early, hol: Math.min(holMin, 480), hol8: Math.max(0, holMin - 480),
        rest: rest.weeklyRestDays.includes(d) ? 480 : 0, ph: rest.paidHolidays.includes(d) ? 480 : 0,
        leave: lvMin > 0 ? { label: lvMin >= 480 ? lvName || '8H' : `${hm(lvMin)}H`, tone } : null,
      });
    }
    const total = (k: 'base' | 'early' | 'ot' | 'hol' | 'hol8') => [...grid.values()].reduce((a, g) => a + g[k], 0);

    // 시급 × 할증 = 금액 (대장 아래 왼쪽) · 기타 수당 (오른쪽)
    const pay = mine.filter((i) => i.kind === 'PAYMENT');
    const pick = (...codes: string[]) => pay.filter((i) => codes.includes(String(i.item_code)));
    const sumAmt = (xs: Row[]) => xs.reduce((a, i) => a + Number(i.amount), 0);
    const sumQty = (xs: Row[]) => xs.reduce((a, i) => a + (Number(i.quantity) || 0), 0);
    const rateOf = (xs: Row[]) => (xs.find((i) => i.unit_price !== null)?.unit_price as number | undefined) ?? null;
    const factorOf = (xs: Row[], d: number) => n(xs.find((i) => i.factor !== null)?.factor) ?? d;
    const baseItems = pick('BASE', 'BASE_PAY', 'PAID_LEAVE');
    const otItems = pick('OVERTIME', 'OVERTIME_PAY');
    const night = pick('NIGHT', 'NIGHT_PAY');
    const hol = pick('HOLIDAY', 'HOLIDAY_PAY');
    const hol8 = pick('HOLIDAY_OVER8');
    const earlyH = hm(total('early'));
    const otRate = rateOf(otItems) ?? rateOf(baseItems);
    const otFactor = factorOf(otItems, 1.5);
    const earlyAmt = earlyH && otRate !== null ? Math.round(earlyH * otRate * otFactor) : 0;
    const lines: TimeLine[] = [
      { label: '기본근무', qty: sumQty(baseItems) || null, rate: rateOf(baseItems), factor: 1, amt: sumAmt(baseItems) },
      { label: '조기근무', qty: earlyH, rate: otRate, factor: otFactor, amt: earlyAmt },
      { label: '연장근무', qty: hm(sumQty(otItems) * 60 - earlyH * 60), rate: otRate, factor: otFactor, amt: sumAmt(otItems) - earlyAmt },
      ...(night.length ? [{ label: '야간가산', qty: sumQty(night), rate: rateOf(night) ?? otRate, factor: factorOf(night, 0.5), amt: sumAmt(night) }] : []),
      { label: '휴일근무', qty: sumQty(hol), rate: rateOf(hol) ?? otRate, factor: factorOf(hol, 1.5), amt: sumAmt(hol) },
      { label: '휴일연장', qty: sumQty(hol8), rate: rateOf(hol8) ?? otRate, factor: factorOf(hol8, 2), amt: sumAmt(hol8) },
      { label: '주차', qty: sumQty(pick('WEEKLY_REST')), rate: rateOf(pick('WEEKLY_REST')) ?? otRate, factor: 1, amt: sumAmt(pick('WEEKLY_REST')) },
      { label: '유휴', qty: sumQty(pick('PAID_HOLIDAY')), rate: rateOf(pick('PAID_HOLIDAY')) ?? otRate, factor: 1, amt: sumAmt(pick('PAID_HOLIDAY')) },
    ];
    const extraItems = pay.filter((i) => !TIME_CODES.has(String(i.item_code)));
    const extras = extraItems.map((i) => ({ label: nameOf(i), amount: Number(i.amount), note: i.source === 'MANUAL' ? L.manual : i.source === 'OVERRIDE' ? L.override : '' }));
    const deductions = mine.filter((i) => i.kind === 'DEDUCTION').map((i) => ({ label: nameOf(i), amount: Number(i.amount) }));

    // 날짜표 시간 합계가 명세서 시간과 다르면 알린다 (시급제만 — 월급제는 기본급이 시간과 따로)
    if (hourly) {
      const pairsCheck: [string, number, number][] = [['기본근무', hm(total('base')), hm(sumQty(baseItems) * 60)], ['연장(조기 포함)', hm(total('early') + total('ot')), hm(sumQty(otItems) * 60)], ['휴일근무', hm(total('hol') + total('hol8')), hm((sumQty(hol) + sumQty(hol8)) * 60)]];
      for (const [k, g, st] of pairsCheck) if (Math.abs(g - st) > 0.01) mismatch.push(`${nm} — ${k}: 날짜표 ${g}시간 · 명세서 ${st}시간`);
    }
    return { ...empty, grid, lines, timeSum: lines.reduce((a, l) => a + l.amt, 0), extras, extraSum: sumAmt(extraItems), deductions };
  });

  const okP = people.filter((x) => x.ok);
  const tot = (k: 'pay' | 'deduction' | 'net' | 'employer') => okP.reduce((a, x) => a + (x[k] ?? 0), 0);
  return {
    year: ym.slice(0, 4), mon: String(+ym.slice(5, 7)), last, draft: run.status !== 'FINALIZED', days,
    halves: [days.filter((d) => +d.slice(8) <= 15), days.filter((d) => +d.slice(8) > 15)],
    isRed: (d) => wd(d) === 0 || period.holidays.some((h) => h.date === d && h.kind === 'public'),
    isSat: (d) => wd(d) === 6,
    people, items, mismatch,
    sums: { pay: tot('pay'), deduction: tot('deduction'), net: tot('net'), employer: tot('employer'), itemPay: items.filter((i) => i.kind === 'PAYMENT').reduce((a, i) => a + i.amount, 0), itemDeduction: items.filter((i) => i.kind === 'DEDUCTION').reduce((a, i) => a + i.amount, 0), ok: okP.length, blocked: people.length - okP.length },
  };
}

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
export const LEDGER_ROWS = [['기본근무', 'base'], ['조기', 'early'], ['연장', 'ot'], ['휴일근무', 'hol'], ['휴일연장', 'hol8'], ['주차', 'rest'], ['유휴', 'ph']] as const;
