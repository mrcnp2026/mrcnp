// 연차 부여 입력 (4-7). ★ 관리자가 직접 쓴 숫자만 저장한다 — 참고 계산기 값은 이 경로로 오지 않는다.
// 같은 직원·같은 기간 이름이면 고친다 (오타 수정). 변경 기록(audit_row)에 남는다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const quarter = (n: number) => Number.isFinite(n) && n >= 0 && n <= 99 && Math.round(n * 4) === n * 4;

export const POST = api('admin.leave.grant', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const granted = num(b.grantedDays);
  const carried = b.carriedDays === undefined || b.carriedDays === '' ? 0 : num(b.carriedDays);
  const label = cleanText(b.periodLabel);
  if (typeof b.employeeId !== 'string' || !label || label.length > 40) throw new ApiError(400, 'invalid_input');
  if (!quarter(granted) || !quarter(carried)) throw new ApiError(400, 'invalid_days');
  if (b.basis !== 'hire_date' && b.basis !== 'fiscal_year') throw new ApiError(400, 'invalid_input');
  if (typeof b.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.effectiveFrom)) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id').eq('id', b.employeeId).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  const { error } = await db.from('leave_grants').upsert(
    {
      employee_id: b.employeeId, period_label: label, granted_days: granted, carried_days: carried, basis: b.basis,
      effective_from: b.effectiveFrom, note: cleanText(b.note).slice(0, 200) || null, created_by: me.id,
    },
    { onConflict: 'employee_id,period_label' },
  );
  if (error) throw new Error(`leave.grant: ${error.code}`);
  return { ok: true };
});
