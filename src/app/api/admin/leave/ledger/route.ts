// 휴가 원장 — 정책 시작/고치기 · 연차 후보 만들기 · 후보 승인/반려/거두기 · 직접 지급 · 소멸 처리 · 이월 · 퇴사 정산 · 종류별 신청 규칙 (PRD v1.3 36 · 38장). 관리자만.
// ★ 후보는 관리자가 승인해야 잔여에 들어간다. 소멸도 관리자가 눌러야 들어간다 — 자동으로 반영하지 않는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { requireAdmin } from '@/lib/auth';
import { DAY_MINUTES, validateLeavePolicy, validateTypeRule } from '@/lib/leave-ledger';
import { addManualLot, carryLot, createSettlement, decideLots, decideSettlement, runAccrual, runExpiry, saveLeavePolicy, saveTypeRule, seedLeavePolicy, setPolicyVerification, syncEmployeeLedger } from '@/lib/leave-ledger-data';
import { cleanText } from '@/lib/text';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const POST = api('admin.leave.ledger', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const today = toKstDate(new Date());
  if (b.action === 'seed') {
    const name = cleanText(b.groupName).slice(0, 60);
    if (!name) throw new ApiError(400, 'invalid_input');
    await seedLeavePolicy(me, name);
    return { ok: true };
  }
  if (b.action === 'policy') {
    const policy = validateLeavePolicy(b.policy);
    const reason = cleanText(b.reason);
    if (!policy || !isDate(b.validFrom) || typeof b.expectedVersion !== 'number' || reason.length < 2 || reason.length > 500) throw new ApiError(400, 'invalid_input');
    await saveLeavePolicy({ policy, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion, me });
    return { ok: true };
  }
  if (b.action === 'verify') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || (b.state !== 'TEMPORARY' && b.state !== 'VERIFIED')) throw new ApiError(400, 'invalid_input');
    await setPolicyVerification(b.id, b.state, cleanText(b.note).slice(0, 500) || null);
    return { ok: true };
  }
  if (b.action === 'accrue') return { accrual: await runAccrual({ asOf: today, me }) };
  if (b.action === 'decide') {
    if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 500 || !b.ids.every((x) => typeof x === 'string' && UUID.test(x))) throw new ApiError(400, 'invalid_input');
    if (b.decision !== 'approve' && b.decision !== 'reject' && b.decision !== 'withdraw') throw new ApiError(400, 'invalid_input');
    return { results: await decideLots({ ids: [...new Set(b.ids as string[])], decision: b.decision, me }) };
  }
  if (b.action === 'manual') {
    const days = typeof b.days === 'number' ? b.days : typeof b.days === 'string' && b.days.trim() !== '' ? Number(b.days) : NaN;
    const note = cleanText(b.note);
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || !Number.isFinite(days) || days <= 0 || days > 99 || !Number.isInteger(days * 16)) throw new ApiError(400, 'invalid_days');
    if (b.kind !== 'manual' && b.kind !== 'carry' && b.kind !== 'compensatory' && b.kind !== 'migrated') throw new ApiError(400, 'invalid_input');
    const to = b.usableTo === '' || b.usableTo === null || b.usableTo === undefined ? null : b.usableTo;
    if (!isDate(b.usableFrom) || (to !== null && (!isDate(to) || to <= b.usableFrom)) || note.length < 2 || note.length > 300) throw new ApiError(400, 'invalid_input');
    const r = await addManualLot({ employeeId: b.employeeId, kind: b.kind, minutes: Math.round(days * DAY_MINUTES), usableFrom: b.usableFrom, usableTo: to as string | null, note, me });
    if (r.result === 'locked') throw new ApiError(409, 'period_locked');
    return { ok: true };
  }
  if (b.action === 'sync') {
    // 휴가 승인 · 취소 때 원장 맞추기가 실패했거나 마감에 막혔던 것을 다시 맞춘다
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    return { sync: await syncEmployeeLedger(b.employeeId, me.id) };
  }
  if (b.action === 'carry') {
    if (typeof b.lotId !== 'string' || !UUID.test(b.lotId)) throw new ApiError(400, 'invalid_input');
    return { carry: await carryLot({ lotId: b.lotId, me }) };
  }
  if (b.action === 'settle') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || !isDate(b.retireOn)) throw new ApiError(400, 'invalid_input');
    await createSettlement({ employeeId: b.employeeId, retireOn: b.retireOn, me });
    return { ok: true };
  }
  if (b.action === 'settleDecide') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || (b.decision !== 'approve' && b.decision !== 'reject')) throw new ApiError(400, 'invalid_input');
    return { settle: await decideSettlement({ id: b.id, decision: b.decision, me }) };
  }
  if (b.action === 'typeRule') {
    await requireConsole(); // 휴가 유형의 신청 규칙은 통합설정 — 숫자 4자리로 연 관리자만
    const rule = validateTypeRule(b.rule);
    if (typeof b.code !== 'string' || b.code.length < 1 || b.code.length > 40 || !rule || typeof b.expectedVersion !== 'number') throw new ApiError(400, 'invalid_input');
    await saveTypeRule({ code: b.code, rule, expectedVersion: b.expectedVersion, me });
    return { ok: true };
  }
  if (b.action === 'expire') return { expiry: await runExpiry({ asOf: today, me }) };
  throw new ApiError(400, 'invalid_input');
});
