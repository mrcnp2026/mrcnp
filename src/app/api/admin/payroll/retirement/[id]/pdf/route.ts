// 퇴직급여 계산서 PDF (2026-10-20, 미구현 #14). 급여 담당 관리자만. 초안이면 「검토용」, 거둔 건이면 「거둔 것」이 찍힌다.
import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { pdfResponse, retirementPdfBytes } from '@/lib/payroll/paper-pdf';
import { loadCase } from '@/lib/payroll/retirement-data';
import { payrollAudit } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(400, 'invalid_input');
  const k = await loadCase(id);
  if (!k) return deny(404, 'not_found');
  const { data: p } = await createAdminClient().from('profiles').select('name, employee_no, group_id').eq('id', k.employeeId).maybeSingle();
  // 검사 계정의 건은 검사 계정에게만 (화면과 같다)
  if (!p || !!(p.employee_no as string | null)?.startsWith('e2e-') !== !!me.employeeNo?.startsWith('e2e-')) return deny(404, 'not_found');
  if (k.amount === null) return deny(409, 'retirement_no_amount');
  const requestId = randomUUID();
  await payrollAudit({ actorId: me.id, action: 'retirement.pdf', table: 'payroll_retirement_cases', subjectId: k.id, employeeId: k.employeeId, requestId, detail: { state: k.state, revision: k.revision } });
  const { bytes, file } = await retirementPdfBytes(k, { name: p.name as string, employeeNo: p.employee_no as string | null, groupId: p.group_id as string | null });
  return pdfResponse(bytes, file, `retirement_${k.periodTo.replace(/-/g, '')}_rev${k.revision}.pdf`, requestId);
}
