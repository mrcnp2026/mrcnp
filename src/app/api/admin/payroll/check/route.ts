// 급여 점검 결정 (결정 급여-68) — 급여를 보는 최고관리자만.
//   decide : 점검 항목 하나를 「이대로 반영(as_is)」 또는 「급여대장에서 이번 달만 조정(adjust)」으로 처리 — 사유 · 누가 · 언제가 남는다
//   undo   : 그 결정을 거둔다(지우지 않고 active=false)
//   term   : 계약 만료일 넣기 · 바꾸기 · 비우기 — 앞 판은 끄고 새 판을 남긴다
// 「고쳐야만 사라지는 항목(근태 마감 안 됨 · 계산이 막힘)」은 결정할 수 없다 — 화면이 단추를 보이지 않고, 여기서도 막는다(must_ 로 시작하는 열쇠).
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUST = new Set(['not_closed']);

export const POST = api('admin.payroll.check', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  const practice = OFFICE.practiceMode && b.live !== true;
  const db = createAdminClient();
  if (typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 300) : null;

  if (b.action === 'term') {
    const endsOn = b.endsOn === null || b.endsOn === '' ? null : typeof b.endsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.endsOn) ? b.endsOn : undefined;
    if (endsOn === undefined) throw new ApiError(400, 'invalid_input');
    const off = await db.from('payroll_contract_terms').update({ active: false, updated_by: me.id }).eq('employee_id', b.employeeId).eq('active', true);
    if (off.error) throw new Error(`check.term.off: ${off.error.code}`);
    if (endsOn) {
      const { error } = await db.from('payroll_contract_terms').insert({ employee_id: b.employeeId, ends_on: endsOn, note, created_by: me.id });
      if (error) throw new Error(`check.term: ${error.code}`);
    }
    return { ok: true };
  }

  if (typeof b.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month)) throw new ApiError(400, 'invalid_input');
  if (typeof b.itemKey !== 'string' || b.itemKey.length < 1 || b.itemKey.length > 80) throw new ApiError(400, 'invalid_input');
  if (MUST.has(b.itemKey) || b.itemKey.startsWith('blocked:')) throw new ApiError(409, 'must_fix'); // 고쳐야만 사라지는 항목
  if (b.action === 'undo') {
    const { error } = await db.from('payroll_check_reviews').update({ active: false, released_by: me.id, released_at: new Date().toISOString() }).eq('month', b.month).eq('employee_id', b.employeeId).eq('item_key', b.itemKey).eq('is_test', practice).eq('active', true);
    if (error) throw new Error(`check.undo: ${error.code}`);
    return { ok: true };
  }
  if (b.action !== 'decide' || (b.decision !== 'as_is' && b.decision !== 'adjust')) throw new ApiError(400, 'invalid_input');
  if (b.decision === 'adjust' && !note) throw new ApiError(400, 'reason_required'); // 무엇을 어떻게 조정할지 적는다
  const { error } = await db.from('payroll_check_reviews').insert({ month: b.month, employee_id: b.employeeId, item_key: b.itemKey, decision: b.decision, note, is_test: practice, decided_by: me.id });
  if (error?.code === '23505') return { ok: true, already: true };
  if (error) throw new Error(`check.decide: ${error.code}`);
  return { ok: true };
});
