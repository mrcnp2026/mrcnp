// 일용직 — 대상자 · 고용 기간 · 근무 입력 · 일용 대장 · 조정 (PRD v1.3 18.5 W07, 2026-10-28 급여-58). 급여 담당 관리자만(조정은 최고관리자만). 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { AUTO_CODES, PAY_BASES, toDailyItems, toMonthlyItems, type DailyTerms, type PayBasis } from '@/lib/payroll/daily';
import { addAdjustment, addEngagement, addPayee, addWork, calculateDaily, createDailyRun, deletePayee, editWork, finalizeDaily, removeAdjustment, reviewDaily, setEngagement, setPayeeActive, setWorkStatus, startDailyCorrection, updatePayee, type PayeeInfo } from '@/lib/payroll/daily-data';

export const maxDuration = 300; // 직원 · 기록이 늘어도 시간 제한에 조용히 끊기지 않게 (2026-11-04, Fluid는 실제 계산 시간만 과금)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const won = (v: unknown): number | null | undefined => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 1e9 ? n : undefined; // undefined = 틀린 값
};
const ins = (v: unknown): v is 'UNKNOWN' | 'AUTO' | 'YES' | 'NO' => v === 'UNKNOWN' || v === 'AUTO' || v === 'YES' || v === 'NO';
const basisOf = (v: unknown): PayBasis | null => (v === undefined || v === null || v === '' ? 'DAY' : (PAY_BASES as readonly unknown[]).includes(v) ? (v as PayBasis) : null);
const termsOf = (b: Record<string, unknown>): DailyTerms | null => {
  const tax = b.taxState ?? 'DAILY', ei = b.ei ?? 'AUTO', np = b.np ?? 'AUTO', hi = b.hi ?? 'AUTO';
  return (tax === 'UNKNOWN' || tax === 'DAILY' || tax === 'BUSINESS' || tax === 'NONE') && ins(ei) && ins(np) && ins(hi) ? { taxState: tax, ei, np, hi } : null;
};
// 보험을 「자동」이 아니라 직접 「적용 · 제외」로 정했으면 무엇을 보고 정했는지 적는다
const needsBasis = (t: DailyTerms) => [t.ei, t.np, t.hi].some((v) => v === 'YES' || v === 'NO');
/** 대상자 정보 — 이름 · 연락처 · 일반/외국인 · 국적 · 체류 자격 · 매달 항목 */
function infoOf(b: Record<string, unknown>): PayeeInfo {
  const name = clean(b.name, 60);
  const kind = b.workerKind === 'FOREIGN' ? 'FOREIGN' : 'GENERAL';
  const nationality = clean(b.nationality, 2).toUpperCase();
  const visa = clean(b.visaType, 10).toUpperCase();
  const monthly = b.monthlyItems === undefined ? undefined : toMonthlyItems(b.monthlyItems);
  if (!name || monthly === null || (nationality && !/^[A-Z]{2}$/.test(nationality)) || (b.stayUntil && !isDate(b.stayUntil))) throw new ApiError(400, 'invalid_input');
  return { name, jobTitle: clean(b.jobTitle, 40) || null, phone: clean(b.phone, 30) || null, note: clean(b.note, 300) || null, workerKind: kind, nationality: nationality || null, visaType: visa || null, stayUntil: isDate(b.stayUntil) ? b.stayUntil : null, ...(monthly ? { monthlyItems: monthly } : {}) };
}
const qtyOf = (v: unknown) => {
  const q = Number(v ?? 1);
  if (!(q > 0 && q <= 744) || Math.round(q * 100) !== q * 100) throw new ApiError(400, 'invalid_input'); // 기준별 상한은 addWork가 본다
  return q;
};

export const POST = api('admin.payroll.daily', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const practice = OFFICE.practiceMode && b.live !== true;
  const requestId = ctx.requestId;
  switch (b.action) {
    case 'payee.add': {
      // 대상자와 첫 고용 조건을 한 번에 (2026-10-28 급여-58). 고용 조건을 빼면 대상자만 넣는다
      const info = infoOf(b);
      if (b.profileId !== undefined && b.profileId !== null && b.profileId !== '' && !isId(b.profileId)) throw new ApiError(400, 'invalid_input');
      const eng = b.engagement && typeof b.engagement === 'object' ? (b.engagement as Record<string, unknown>) : null;
      let engInput: Parameters<typeof addEngagement>[0] | null = null;
      if (eng) {
        const terms = termsOf(eng), rate = won(eng.dayRate), payBasis = basisOf(eng.payBasis), basis = clean(eng.basisNote, 300);
        if (!terms || !payBasis || rate === undefined || !isDate(eng.startsOn) || (eng.endsOn && !isDate(eng.endsOn))) throw new ApiError(400, 'invalid_input');
        if (needsBasis(terms) && basis.length < 2) throw new ApiError(400, 'daily_basis');
        engInput = { payeeId: '', startsOn: eng.startsOn, endsOn: isDate(eng.endsOn) ? eng.endsOn : null, project: clean(eng.project, 80), dayRate: rate, payBasis, terms, basisNote: basis || null, me, requestId };
      }
      const made = await addPayee({ ...info, internalNo: clean(b.internalNo, 30), profileId: isId(b.profileId) ? b.profileId : null, me, requestId });
      if (engInput) await addEngagement({ ...engInput, payeeId: made.id });
      return made;
    }
    case 'payee.update':
      if (!isId(b.id)) throw new ApiError(400, 'invalid_input');
      await updatePayee({ ...infoOf(b), id: b.id, me, requestId });
      return { ok: true };
    case 'payee.delete':
      if (!isId(b.id)) throw new ApiError(400, 'invalid_input');
      await deletePayee({ id: b.id, me, requestId });
      return { ok: true };
    case 'payee.active':
      if (!isId(b.id) || typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
      await setPayeeActive({ id: b.id, active: b.active, me, requestId });
      return { ok: true };
    case 'engagement.add': {
      const terms = termsOf(b), rate = won(b.dayRate), payBasis = basisOf(b.payBasis);
      if (!payBasis) throw new ApiError(400, 'invalid_input');
      if (!isId(b.payeeId) || !isDate(b.startsOn) || (b.endsOn !== '' && b.endsOn !== null && b.endsOn !== undefined && !isDate(b.endsOn)) || !terms || rate === undefined) throw new ApiError(400, 'invalid_input');
      const basis = clean(b.basisNote, 300);
      if (needsBasis(terms) && basis.length < 2) throw new ApiError(400, 'daily_basis');
      return addEngagement({ payeeId: b.payeeId, startsOn: b.startsOn, endsOn: isDate(b.endsOn) ? b.endsOn : null, project: clean(b.project, 80), dayRate: rate, payBasis, terms, basisNote: basis || null, me, requestId });
    }
    case 'engagement.set': {
      if (!isId(b.id)) throw new ApiError(400, 'invalid_input');
      if (b.disable === true) await setEngagement({ id: b.id, disable: true, me, requestId });
      else {
        const terms = termsOf(b), rate = won(b.dayRate), basis = clean(b.basisNote, 300);
        if (!terms || rate === undefined || (b.endsOn !== '' && b.endsOn !== null && b.endsOn !== undefined && !isDate(b.endsOn))) throw new ApiError(400, 'invalid_input');
        if (needsBasis(terms) && basis.length < 2) throw new ApiError(400, 'daily_basis');
        await setEngagement({ id: b.id, endsOn: isDate(b.endsOn) ? b.endsOn : null, dayRate: rate, terms, basisNote: basis || null, me, requestId });
      }
      return { ok: true };
    }
    case 'work.add': {
      // 여러 날짜를 한 번에 (workDates). 예전 화면처럼 workDate 하나도 받는다
      const items = toDailyItems(b.items ?? []), rate = won(b.dayRate), qty = qtyOf(b.quantity);
      const dates = Array.isArray(b.workDates) ? b.workDates : [b.workDate];
      if (!isId(b.payeeId) || !items || rate === undefined || dates.length === 0 || dates.length > 31 || !dates.every(isDate)) throw new ApiError(400, 'invalid_input');
      return addWork({ payeeId: b.payeeId, workDates: dates as string[], project: clean(b.project, 80), segmentKey: clean(b.segmentKey, 10) || 'A', quantity: qty, dayRate: rate, items, basisNote: clean(b.basisNote, 300) || null, confirm: b.confirm !== false, practice, me, requestId });
    }
    case 'work.edit': {
      const items = toDailyItems(b.items ?? []), rate = won(b.dayRate), qty = qtyOf(b.quantity);
      if (!isId(b.id) || !Number.isInteger(b.expectedVersion) || !items || rate === undefined) throw new ApiError(400, 'invalid_input');
      return editWork({ id: b.id, expectedVersion: b.expectedVersion as number, quantity: qty, dayRate: rate, items, basisNote: clean(b.basisNote, 300) || null, me, requestId });
    }
    case 'work.status':
      if (!isId(b.id) || !Number.isInteger(b.expectedVersion) || (b.status !== 'CONFIRMED' && b.status !== 'VOID')) throw new ApiError(400, 'invalid_input');
      await setWorkStatus({ id: b.id, expectedVersion: b.expectedVersion as number, status: b.status, me, requestId });
      return { ok: true };
    case 'adjust.add': {
      // 최고관리자의 금액 조정 — 자동 항목(보험 · 세금)은 그 금액으로 바꾸고, 그 밖의 항목은 더한다. 0원도 넣을 수 있다(예: 보험을 0원으로)
      const code = clean(b.code, 40).toUpperCase(), label = clean(b.label, 40), reason = clean(b.reason, 300);
      const amount = typeof b.amount === 'number' ? b.amount : Number(String(b.amount ?? '').replace(/,/g, ''));
      const auto = (AUTO_CODES as readonly string[]).includes(code);
      const kind = auto ? 'DEDUCTION' : b.kind === 'PAYMENT' ? 'PAYMENT' : b.kind === 'DEDUCTION' ? 'DEDUCTION' : null;
      if (!isId(b.runId) || !isId(b.payeeId) || !/^[A-Z0-9_]{1,40}$/.test(code) || !kind || !Number.isInteger(amount) || amount < 0 || amount > 1e9 || (!auto && !label) || reason.length < 2) throw new ApiError(400, 'invalid_input');
      return addAdjustment({ runId: b.runId, payeeId: b.payeeId, code, label: label || code, kind, amount, reason, me, requestId });
    }
    case 'adjust.remove':
      if (!isId(b.id)) throw new ApiError(400, 'invalid_input');
      await removeAdjustment({ id: b.id, me, requestId });
      return { ok: true };
    case 'run.create':
      if (typeof b.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) || !isDate(b.payDate)) throw new ApiError(400, 'invalid_input');
      return createDailyRun({ month: b.month, payDate: b.payDate, practice, me, requestId });
    case 'run.correct': {
      const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (!isId(b.id) || reason.length < 2 || reason.length > 500) throw new ApiError(400, 'payroll_reason_required');
      return startDailyCorrection({ id: b.id, reason, me, requestId });
    }
    case 'run.calculate':
    case 'run.review':
    case 'run.finalize': {
      if (!isId(b.id) || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
      const a = { id: b.id, expectedVersion: b.expectedVersion as number, me, requestId };
      if (b.action === 'run.calculate') return { calculated: await calculateDaily(a) };
      if (b.action === 'run.review') await reviewDaily(a);
      else await finalizeDaily(a);
      return { ok: true };
    }
    default:
      throw new ApiError(400, 'invalid_input');
  }
});
