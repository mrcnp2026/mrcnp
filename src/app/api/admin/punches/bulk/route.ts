// 출퇴근 기록 엑셀 일괄 입력 (2026-10-20 노프로 비교) — GET ?date=: 양식(켜진 직원 × 그 날짜) · POST: 올린 파일 미리보기 / 넣기. 관리자만.
// 한 줄 = 한 사람 한 날의 출근 · 퇴근. 관리자 대리 등록과 같은 길(proxyPunch)이라 확정된 날 · 마감된 달 · 이미 있는 기록 · 미래 시각은 막힌다.
// 본인 기록은 넣지 못한다(정정 요청으로). 끝나면 바뀐 날의 연장근로 확인을 한 번에 맞춘다.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getTranslations } from 'next-intl/server';
import { api, ApiError } from '@/lib/api';
import { requireAdmin, type Me } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { syncOvertimeFor } from '@/lib/period-data';
import { proxyPunch } from '@/lib/proxy-punch-data';
import { punchTemplate, readPunches, type PunchLabels, type PunchMember } from '@/lib/punch-bulk';
import { assertStaffTarget } from '@/lib/staff-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { toKstDate } from '@/lib/time';
import { isTestNo } from '@/lib/work-messages';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;

async function labels(): Promise<PunchLabels & { reason: string }> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.records.bulk' });
  return { sheet: t('sheet'), guide: t('guide'), cols: { employeeNo: t('colNo'), name: t('colName'), date: t('colDate'), in: t('colIn'), out: t('colOut'), reason: t('colReason') }, reason: t('defaultReason') };
}
async function members(me: Me): Promise<PunchMember[]> {
  const { data } = await createAdminClient().from('profiles').select('id, name, employee_no').eq('active', true).or(NOT_SYSTEM_ADMIN).order('employee_no');
  return (data ?? []).filter((p) => isTestNo(p.employee_no as string | null) === isTestNo(me.employeeNo) && p.id !== me.id).map((p) => ({ id: p.id as string, employeeNo: (p.employee_no as string | null) ?? null, name: p.name as string }));
}

export async function GET(req: Request): Promise<Response> {
  const me = await requireAdmin().catch(() => null);
  if (!me) return deny(403, 'forbidden');
  const q = new URL(req.url).searchParams.get('date');
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : toKstDate(new Date());
  const L = await labels();
  const wb = punchTemplate(await members(me), date, L);
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="punches.xlsx"; filename*=UTF-8''${encodeURIComponent(`${L.sheet}_${date}.xlsx`)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export const POST = api('admin.punches.bulk', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
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
  const lines = readPunches(all, await members(me), L, L.reason);
  if (!lines) throw new ApiError(400, 'import_bad_file');
  if (lines.length > 500) throw new ApiError(400, 'import_too_many');
  if (form.get('apply') !== '1') return { lines };
  const results: { row: number; in: string | null; out: string | null }[] = [];
  const touched = new Map<string, string[]>();
  for (const l of lines.filter((x) => !x.error)) {
    const one = async (kind: 'in' | 'out', time: string | null): Promise<string | null> => {
      if (!time) return null;
      try {
        await assertStaffTarget(me.id, l.employeeId!, 'approve');
        await proxyPunch({ me, employeeId: l.employeeId!, workDate: l.workDate, kind, time, nextDay: kind === 'out' && l.nextDay, reason: l.reason, requestId: ctx.requestId, syncOvertime: false });
        touched.set(l.employeeId!, [...(touched.get(l.employeeId!) ?? []), l.workDate!]);
        return 'ok';
      } catch (e) {
        return e instanceof ApiError ? e.code : 'generic';
      }
    };
    results.push({ row: l.row, in: await one('in', l.in), out: await one('out', l.out) });
  }
  for (const [id, dates] of touched) syncOvertimeFor(id, [...new Set(dates)]);
  return { lines, results };
});
