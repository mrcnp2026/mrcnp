// 급여대장의 작업 — 계산 · 검토 · 확정 · 대상 빼기/넣기 · 금액 조정 · 명세서 공개/회수 (PRD v1.3 18.3 · 19장). 급여 담당 관리자만.
// 계산 · 검토 · 확정은 화면이 보던 판 번호(expectedVersion)가 지금과 같을 때만 된다 — 두 사람이 동시에 누르면 먼저 한 쪽만 성공한다.
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll } from '@/lib/payroll/data';
import { publishRun, unpublishStatement } from '@/lib/payroll/publish-data';
import { addOverride, calculateRun, finalizeRun, loadRun, reviewRun, setMember, startCorrection, withdrawOverride } from '@/lib/payroll/run-data';
import { syncOvertimeRange } from '@/lib/period-data';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasonOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  return s.length >= 2 && s.length <= 300 ? s : null;
};

export const POST = api<{ params: Promise<{ id: string }> }>('admin.payroll.run', async (req, ctx) => {
  const me = await requirePayroll();
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(400, 'invalid_input');
  const b = await readJson(req);
  const common = { id, me, requestId: ctx.requestId };
  if (b.action === 'calculate' || b.action === 'review' || b.action === 'finalize') {
    if (!Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
    const args = { ...common, expectedVersion: b.expectedVersion as number };
    if (b.action === 'calculate') {
      // 계산 전에 그 기간의 연장근로 확인을 맞춘다 (2026-10-19 — 화면을 열 때 하던 계산을 옮김). 기간 끝(periodTo)은 다음 날 0시라 하루 전까지
      const run = await loadRun(id);
      if (run && run.kind !== 'DAILY') await syncOvertimeRange(run.periodFrom, new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), run.isTest);
      return { calculated: await calculateRun(args) };
    }
    if (b.action === 'review') await reviewRun(args);
    else await finalizeRun(args);
    return { ok: true };
  }
  if (b.action === 'exclude' || b.action === 'include') {
    const reason = b.action === 'exclude' ? reasonOf(b.reason) : null;
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || (b.action === 'exclude' && !reason)) throw new ApiError(400, b.action === 'exclude' && !reason ? 'payroll_reason_required' : 'invalid_input');
    await setMember({ ...common, employeeId: b.employeeId, include: b.action === 'include', reason });
    return { ok: true };
  }
  if (b.action === 'override.add') {
    const amount = typeof b.amount === 'number' ? b.amount : typeof b.amount === 'string' && /^-?\d{1,12}$/.test(b.amount.trim()) ? Number(b.amount) : NaN;
    const reason = reasonOf(b.reason);
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.itemCode !== 'string' || !/^[A-Z0-9_]{2,40}$/.test(b.itemCode) || (b.kind !== 'PAYMENT' && b.kind !== 'DEDUCTION') || !Number.isSafeInteger(amount)) throw new ApiError(400, 'invalid_input');
    if (!reason) throw new ApiError(400, 'payroll_reason_required');
    if (amount < 0 && b.kind === 'PAYMENT') throw new ApiError(400, 'payroll_negative_pay'); // 음수는 환급 · 반환 같은 공제 쪽 정산에만
    await addOverride({ ...common, employeeId: b.employeeId, itemCode: b.itemCode, kind: b.kind, amount, reason });
    return { ok: true };
  }
  if (b.action === 'override.withdraw') {
    if (typeof b.overrideId !== 'string' || !UUID.test(b.overrideId)) throw new ApiError(400, 'invalid_input');
    await withdrawOverride({ ...common, overrideId: b.overrideId });
    return { ok: true };
  }
  if (b.action === 'correct') {
    // 정정: 확정본은 그대로 두고 판 번호를 올린 새 초안을 만든다
    const reason = typeof b.reason === 'string' ? b.reason.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim() : '';
    if (reason.length < 2 || reason.length > 500) throw new ApiError(400, 'payroll_reason_required');
    return { id: (await startCorrection({ id, reason, me, requestId: ctx.requestId })).id };
  }
  // 공개 · 회수 — 확정한 대장만. 공개가 은행 지급을 뜻하지 않고, 문자 · 메일을 보내지 않는다
  if (b.action === 'publish') {
    const ids = b.employeeIds === undefined ? undefined : Array.isArray(b.employeeIds) && b.employeeIds.length > 0 && b.employeeIds.length <= 500 && b.employeeIds.every((x) => typeof x === 'string' && UUID.test(x)) ? (b.employeeIds as string[]) : null;
    if (ids === null) throw new ApiError(400, 'invalid_input');
    return { publish: await publishRun({ runId: id, employeeIds: ids, me, requestId: ctx.requestId }) };
  }
  if (b.action === 'unpublish') {
    const reason = reasonOf(b.reason);
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    if (!reason) throw new ApiError(400, 'payroll_reason_required');
    await unpublishStatement({ runId: id, employeeId: b.employeeId, reason, me, requestId: ctx.requestId });
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
