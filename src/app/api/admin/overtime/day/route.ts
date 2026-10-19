// 하루 한 번에 승인 — 출근 · 퇴근 요청을 승인한 뒤 그날 연장 · 야간 · 휴일 시간을 계산된 그대로 인정한다 (2026-10-18 의뢰인, lib/overtime-day.ts).
// 요청함의 「이 날 요청 모두 승인」이 마지막에 부른다. 승인할 수 있는 사람인지는 requireApprover가 본다(자기 것 · 상위 등급은 막힘).
import { api, ApiError, readJson } from '@/lib/api';
import { approveDayOvertime } from '@/lib/overtime-day';
import { requireApprover } from '@/lib/scope';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.overtime.day', async (req, ctx) => {
  const b = await readJson(req);
  if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId) || typeof b.workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.workDate)) throw new ApiError(400, 'invalid_input');
  const me = await requireApprover(b.employeeId);
  return approveDayOvertime({ employeeId: b.employeeId, workDate: b.workDate, actorId: me.id, requestId: ctx.requestId });
});
