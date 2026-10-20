// 휴가(연차) 엑셀 일괄 입력 (2026-10-20 노프로 비교) — GET: 양식(+ 휴가 종류 시트) · POST: 올린 파일 미리보기 / 넣기. 최고관리자만(직권 휴가와 같다).
// 한 줄 = 한 사람의 휴가 한 건. 직권 휴가와 같은 길: planLeave(direct) → 확정 · 마감 검사 → 넣고 바로 승인(누가 · 왜가 결정 기록에). 겹침은 DB가 막는다.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getTranslations } from 'next-intl/server';
import { OFFICE } from '@/config/office';
import { api, ApiError } from '@/lib/api';
import { requireAdmin, type Me } from '@/lib/auth';
import { assertAttendanceEditable } from '@/lib/confirm-data';
import { deny } from '@/lib/csv-response';
import { leaveTemplate, readLeaves, type LeaveLabels, type LeaveMember } from '@/lib/leave-bulk';
import { loadLeaveTypes } from '@/lib/leave-data';
import { insertApprovedLeave } from '@/lib/leave-direct';
import { planLeave } from '@/lib/leave-request';
import { assertStaffTarget } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { isTestNo } from '@/lib/work-messages';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;

async function labels(): Promise<LeaveLabels & { why: string }> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.leaveBulk' });
  return { sheet: t('sheet'), guide: t('guide'), typesSheet: t('typesSheet'), cols: { employeeNo: t('colNo'), name: t('colName'), type: t('colType'), start: t('colStart'), end: t('colEnd'), time: t('colTime'), reason: t('colReason') }, why: t('why') };
}
async function members(me: Me): Promise<LeaveMember[]> {
  const { data } = await createAdminClient().from('profiles').select('id, name, employee_no').eq('active', true).or(NOT_SYSTEM_ADMIN).order('employee_no');
  return (data ?? []).filter((p) => isTestNo(p.employee_no as string | null) === isTestNo(me.employeeNo) && p.id !== me.id).map((p) => ({ id: p.id as string, employeeNo: (p.employee_no as string | null) ?? null, name: p.name as string }));
}
const kinds = async () => (await loadLeaveTypes()).map((t) => ({ code: t.code, name: t.name, dayUnit: t.dayUnit }));

export async function GET(): Promise<Response> {
  const me = await requireAdmin().catch(() => null);
  if (!me?.top) return deny(403, 'forbidden');
  const L = await labels();
  const wb = leaveTemplate(await kinds(), L);
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="leave.xlsx"; filename*=UTF-8''${encodeURIComponent(`${L.sheet}.xlsx`)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export const POST = api('admin.leave.bulk', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  if (!me.top) throw new ApiError(403, 'top_only');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ApiError(400, 'import_bad_file');
  }
  const all: unknown[][] = [];
  wb.worksheets[0]?.eachRow({ includeEmpty: true }, (row) => all.push((row.values as unknown[]).slice(1)));
  const L = await labels();
  const lines = readLeaves(all, await members(me), await kinds(), L);
  if (!lines) throw new ApiError(400, 'import_bad_file');
  if (lines.length > 300) throw new ApiError(400, 'import_too_many');
  if (form.get('apply') !== '1') return { lines };
  const practice = OFFICE.practiceMode;
  const results: { row: number; ok: boolean; code?: string; days?: number }[] = [];
  for (const l of lines.filter((x) => !x.error)) {
    try {
      await assertStaffTarget(me.id, l.employeeId!, 'approve');
      const plan = await planLeave(l.employeeId!, { typeCode: l.typeCode, startDate: l.startDate, endDate: l.endDate, startTime: l.startTime ?? undefined, reason: l.reason }, { direct: true });
      await assertAttendanceEditable(l.employeeId!, plan.start, plan.end, practice);
      await insertApprovedLeave({ employeeId: l.employeeId!, plan, why: `${L.why} · ${file.name}`.slice(0, 200), me, requestId: ctx.requestId, practice });
      results.push({ row: l.row, ok: true, days: plan.days });
    } catch (e) {
      results.push({ row: l.row, ok: false, code: e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { lines, results };
});
