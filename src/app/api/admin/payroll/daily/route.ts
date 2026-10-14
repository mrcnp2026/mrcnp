// 일용직 — 대상자 · 고용 기간 · 근무 입력 · 일용 대장 (PRD v1.3 18.5 W07). 급여 담당 관리자만. 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { toDailyItems, type DailyTerms } from '@/lib/payroll/daily';
import { addEngagement, addPayee, addWork, calculateDaily, createDailyRun, finalizeDaily, reviewDaily, setEngagement, setPayeeActive, setWorkStatus, startDailyCorrection } from '@/lib/payroll/daily-data';

export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');
const won = (v: unknown): number | null | undefined => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 1e9 ? n : undefined; // undefined = 틀린 값
};
const tri = (v: unknown): v is 'UNKNOWN' | 'YES' | 'NO' => v === 'UNKNOWN' || v === 'YES' || v === 'NO';
const termsOf = (b: Record<string, unknown>): DailyTerms | null => (b.taxState === 'UNKNOWN' || b.taxState === 'DAILY' || b.taxState === 'NONE') && tri(b.ei) && tri(b.np) && tri(b.hi) ? { taxState: b.taxState, ei: b.ei, np: b.np, hi: b.hi } : null;

export const POST = api('admin.payroll.daily', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const practice = OFFICE.practiceMode && b.live !== true;
  const requestId = ctx.requestId;
  switch (b.action) {
    case 'payee.add': {
      const internalNo = clean(b.internalNo, 30), name = clean(b.name, 60);
      if (!internalNo || !name || (b.profileId !== undefined && b.profileId !== null && b.profileId !== '' && !isId(b.profileId))) throw new ApiError(400, 'invalid_input');
      return addPayee({ internalNo, name, phone: clean(b.phone, 30) || null, note: clean(b.note, 300) || null, profileId: isId(b.profileId) ? b.profileId : null, me, requestId });
    }
    case 'payee.active':
      if (!isId(b.id) || typeof b.active !== 'boolean') throw new ApiError(400, 'invalid_input');
      await setPayeeActive({ id: b.id, active: b.active, me, requestId });
      return { ok: true };
    case 'engagement.add': {
      const terms = termsOf(b), rate = won(b.dayRate);
      if (!isId(b.payeeId) || !isDate(b.startsOn) || (b.endsOn !== '' && b.endsOn !== null && b.endsOn !== undefined && !isDate(b.endsOn)) || !terms || rate === undefined) throw new ApiError(400, 'invalid_input');
      // 「모름」이 아닌 상태로 정했으면 무엇을 보고 정했는지 적는다
      const basis = clean(b.basisNote, 300);
      if ((terms.taxState !== 'UNKNOWN' || terms.ei !== 'UNKNOWN' || terms.np !== 'UNKNOWN' || terms.hi !== 'UNKNOWN') && basis.length < 2) throw new ApiError(400, 'daily_basis');
      return addEngagement({ payeeId: b.payeeId, startsOn: b.startsOn, endsOn: isDate(b.endsOn) ? b.endsOn : null, project: clean(b.project, 80), dayRate: rate, terms, basisNote: basis || null, me, requestId });
    }
    case 'engagement.set': {
      if (!isId(b.id)) throw new ApiError(400, 'invalid_input');
      if (b.disable === true) await setEngagement({ id: b.id, disable: true, me, requestId });
      else {
        const terms = termsOf(b), rate = won(b.dayRate), basis = clean(b.basisNote, 300);
        if (!terms || rate === undefined || (b.endsOn !== '' && b.endsOn !== null && b.endsOn !== undefined && !isDate(b.endsOn))) throw new ApiError(400, 'invalid_input');
        if ((terms.taxState !== 'UNKNOWN' || terms.ei !== 'UNKNOWN' || terms.np !== 'UNKNOWN' || terms.hi !== 'UNKNOWN') && basis.length < 2) throw new ApiError(400, 'daily_basis');
        await setEngagement({ id: b.id, endsOn: isDate(b.endsOn) ? b.endsOn : null, dayRate: rate, terms, basisNote: basis || null, me, requestId });
      }
      return { ok: true };
    }
    case 'work.add': {
      const items = toDailyItems(b.items ?? []), rate = won(b.dayRate), qty = Number(b.quantity ?? 1);
      if (!isId(b.payeeId) || !isDate(b.workDate) || !items || rate === undefined || !(qty > 0 && qty <= 3) || Math.round(qty * 100) !== qty * 100) throw new ApiError(400, 'invalid_input');
      return addWork({ payeeId: b.payeeId, workDate: b.workDate, project: clean(b.project, 80), segmentKey: clean(b.segmentKey, 10) || 'A', quantity: qty, dayRate: rate, items, basisNote: clean(b.basisNote, 300) || null, practice, me, requestId });
    }
    case 'work.status':
      if (!isId(b.id) || !Number.isInteger(b.expectedVersion) || (b.status !== 'CONFIRMED' && b.status !== 'VOID')) throw new ApiError(400, 'invalid_input');
      await setWorkStatus({ id: b.id, expectedVersion: b.expectedVersion as number, status: b.status, me, requestId });
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
