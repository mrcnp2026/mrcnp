// 관리자 대리 등록 (②-3 7-6). 직원이 못 찍은 출근·퇴근을 관리자가 사유와 함께 넣는다.
// ★ 원본(punch_events)에는 쓰지 않는다 — 관리자 이름의 "빠진 기록 추가" 정정을 만들고 바로 승인한다 (proxy-punch.ts 머리말).
//   누가(requested_by·approved_by)·언제·왜(reason)가 정정 기록과 결정 기록(decision_log)에 남는다. 저장 길은 lib/proxy-punch-data.ts (엑셀 일괄 입력과 같이 쓴다).
import { api, ApiError, readJson } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { requireAdmin } from '@/lib/auth';
import { proxyPunch } from '@/lib/proxy-punch-data';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.proxy.punch', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  // 관리자가 자기 기록을 스스로 넣고 스스로 승인하지 못한다 — 본인 것은 정정 요청으로 보내고 다른 관리자가 처리한다
  await assertStaffTarget(me.id, id, 'approve');
  const b = await readJson(req);
  const r = await proxyPunch({ me, employeeId: id, workDate: b.workDate, kind: b.kind, time: b.time, nextDay: b.nextDay, reason: b.reason, requestId: ctx.requestId });
  return { id: r.id, at: r.at };
});
