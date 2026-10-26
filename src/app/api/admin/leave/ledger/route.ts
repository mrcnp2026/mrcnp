// 휴가 원장 — 정책 시작/고치기 · 연차 자동 발생(지금 바로 실행) · 확인 전 연차 승인/제외/거두기 · 직접 지급 · 소멸 처리 · 이월 · 퇴사 정산 · 종류별 신청 규칙 (PRD v1.3 36 · 38장). 관리자만.
// ★ 연차는 매일 새벽 자동으로 만들고 바로 승인한다(2026-10-19 자동 생성 + 자동 승인, 2026-10-25 화면도 그 방식으로). 자동으로 처리되지 않고 남은 「확인 전」 건만 관리자가 승인한다. 소멸은 관리자가 눌러야 들어간다.
//   2026-10-19부터 매일 새벽 정기 작업(/api/cron/leave-accrual)이 월차 · 연차를 자동으로 만들고 바로 지급한다(급여-10).
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { requireAdmin } from '@/lib/auth';
import { DAY_MINUTES, validateLeavePolicy, validateTypeRule } from '@/lib/leave-ledger';
import { addManualLot, autoAccrue, autoExpire, carryLot, createSettlement, decideLots, decideSettlement, runExpiry, saveLeavePolicy, saveTypeRule, seedLeavePolicy, setPolicyVerification, syncEmployeeLedger, addPolicyGroup, setPolicyGroup, setPolicyMember, startGroupPolicy } from '@/lib/leave-ledger-data';
import { cleanText } from '@/lib/text';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    if (b.groupId !== undefined && b.groupId !== null && (typeof b.groupId !== 'string' || !UUID.test(b.groupId))) throw new ApiError(400, 'invalid_input');
    await saveLeavePolicy({ policy, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion, me, groupId: (b.groupId as string | null | undefined) ?? null });
    return { ok: true };
  }
  // ── 휴가 정책 그룹 (L06 · L07, 2026-10-15) ──
  if (b.action === 'group.add') {
    const name = cleanText(b.name).slice(0, 60);
    if (!name || typeof b.excluded !== 'boolean') throw new ApiError(400, 'invalid_input');
    return addPolicyGroup({ name, excluded: b.excluded, me });
  }
  if (b.action === 'group.set') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
    const name = b.name === undefined ? undefined : cleanText(b.name).slice(0, 60);
    if (name === '' || (b.excluded !== undefined && typeof b.excluded !== 'boolean') || (b.active !== undefined && b.active !== false)) throw new ApiError(400, 'invalid_input');
    await setPolicyGroup({ id: b.id, name, excluded: b.excluded as boolean | undefined, active: b.active as false | undefined, me });
    return { ok: true };
  }
  if (b.action === 'member.set') {
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || (b.groupId !== null && (typeof b.groupId !== 'string' || !UUID.test(b.groupId))) || !isDate(b.validFrom)) throw new ApiError(400, 'invalid_input');
    await setPolicyMember({ employeeId: b.employeeId, groupId: b.groupId as string | null, validFrom: b.validFrom, reason: cleanText(b.reason).slice(0, 300) || null, me });
    return { ok: true };
  }
  if (b.action === 'group.policyStart') {
    if (typeof b.groupId !== 'string' || !UUID.test(b.groupId)) throw new ApiError(400, 'invalid_input');
    await startGroupPolicy({ groupId: b.groupId, me });
    return { ok: true };
  }
  if (b.action === 'verify') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || (b.state !== 'TEMPORARY' && b.state !== 'VERIFIED')) throw new ApiError(400, 'invalid_input');
    await setPolicyVerification(b.id, b.state, cleanText(b.note).slice(0, 500) || null);
    return { ok: true };
  }
  // 「지금 바로 실행」 = 매일 새벽 자동 발생과 같은 일 (2026-10-25 의뢰인: 연차 계산은 자동 승인 방식으로). 시프티에서 옮긴 기간 · 자동 시작 전 기간은 건드리지 않아 중복으로 생기지 않는다
  if (b.action === 'accrue') {
    const accrual = await autoAccrue(today, me);
    return { accrual, expiry: await autoExpire(today, me) }; // 소멸도 함께 (사용 기간이 끝난 연차)
  }
  if (b.action === 'decide') {
    if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > 500 || !b.ids.every((x) => typeof x === 'string' && UUID.test(x))) throw new ApiError(400, 'invalid_input');
    if (b.decision !== 'approve' && b.decision !== 'reject' && b.decision !== 'withdraw') throw new ApiError(400, 'invalid_input');
    return { results: await decideLots({ ids: [...new Set(b.ids as string[])], decision: b.decision, me }) };
  }
  if (b.action === 'manual') {
    const days = typeof b.days === 'number' ? b.days : typeof b.days === 'string' && b.days.trim() !== '' ? Number(b.days) : NaN;
    const note = cleanText(b.note);
    if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || !Number.isFinite(days) || days <= 0 || days > 99 || !Number.isInteger(days * 32)) throw new ApiError(400, 'invalid_days'); // 15분 단위 (묶음 9)
    if (b.kind !== 'manual' && b.kind !== 'carry' && b.kind !== 'migrated') throw new ApiError(400, 'invalid_input'); // 보상휴가는 쓰지 않는다 (2026-10-21 의뢰인)
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
