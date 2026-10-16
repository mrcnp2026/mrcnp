// 내 명세서 PDF (PRD v1.3 23.3 · E01). 본인 것 · 공개 중인 것만 — 아니면 「없음」으로 답한다(있는지도 알려 주지 않는다).
import { randomUUID } from 'node:crypto';
import { getLocale } from 'next-intl/server';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { loadMySlip } from '@/lib/payroll/publish-data';
import { asSlipTime, slipPdfResponse } from '@/lib/payroll/slip-pdf-response';
import { payrollAudit } from '@/lib/payroll/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me) return deny(401, 'not_signed_in');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(404, 'not_found');
  const found = await loadMySlip(me.id, id, OFFICE.practiceMode);
  if (!found) return deny(404, 'not_found');
  const { slip, lines, time } = found;
  const [{ data: mine }, locale] = await Promise.all([createAdminClient().from('profiles').select('group_id').eq('id', me.id).maybeSingle(), getLocale()]);
  const requestId = randomUUID();
  await payrollAudit({ actorId: me.id, action: 'statement.pdf.self', table: 'payroll_statements', subjectId: slip.id, employeeId: me.id, requestId, detail: { revision: slip.revision } });
  return slipPdfResponse({
    locale, no: slip.no, name: me.name, employeeNo: me.employeeNo, groupId: (mine?.group_id as string | null) ?? null, month: slip.month, periodFrom: slip.periodFrom, periodTo: slip.periodTo, payDate: slip.payDate, revision: slip.revision,
    pay: slip.pay, deduction: slip.deduction, net: slip.net, draft: false, practice: slip.isTest, correctionReason: slip.correctionReason, requestId, lines, time: asSlipTime(time),
  });
}
