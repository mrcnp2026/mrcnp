// 직원 여러 명 엑셀로 등록 (2026-10-20 노프로 비교) — GET: 양식(+ 고를 수 있는 소속 · 직무 목록) · POST: 올린 파일 미리보기 / 등록. 관리자만.
// 한 줄 = 한 사람, 한 명씩 추가와 같은 길(createEmployee → 직무 · 이메일 → 이력)로 넣는다. 한 줄이 막혀도 나머지는 넣고 줄마다 결과를 돌려준다.
// 초대 링크는 자동으로 보내지 않는다 — 직원 화면에서 보낸다. 주민번호 · 계좌는 받지 않는다.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getTranslations } from 'next-intl/server';
import { api, ApiError } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { createEmployee, DuplicateEmployeeNo } from '@/lib/invite';
import { loadJobs } from '@/lib/job-data';
import { buildOrgTree } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { readStaff, staffTemplate, STAFF_COLS, type StaffLabels } from '@/lib/staff-bulk';
import { saveForeignInfo } from '@/lib/staff-details';
import { syncStaffHistorySafe } from '@/lib/staff-history';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;

async function labels(): Promise<StaffLabels> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.members.import' });
  return { sheet: t('sheet'), guide: t('guide'), cols: Object.fromEntries(STAFF_COLS.map((c) => [c, t(`col.${c}`)])) as StaffLabels['cols'] };
}
async function lists() {
  const [groups, jobs] = await Promise.all([loadOrgGroups(), loadJobs()]);
  return {
    groups: buildOrgTree(groups.filter((g) => g.active)).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.name}` }))]),
    jobs: jobs.filter((j) => j.active).map((j) => ({ id: j.id, label: j.name })),
  };
}

export async function GET(): Promise<Response> {
  if (!(await requireAdmin().catch(() => null))) return deny(403, 'forbidden');
  const L = await labels();
  const { groups, jobs } = await lists();
  const wb = staffTemplate(groups, jobs, L);
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="staff.xlsx"; filename*=UTF-8''${encodeURIComponent(`${L.sheet}.xlsx`)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export const POST = api('admin.employees.import', async (req) => {
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
  const db = createAdminClient();
  const { data: ppl } = await db.from('profiles').select('employee_no, email');
  const { groups, jobs } = await lists();
  const lines = readStaff(all, { existingNos: new Set((ppl ?? []).map((p) => p.employee_no as string)), groups, jobs, today: toKstDate(new Date()) }, await labels());
  if (!lines) throw new ApiError(400, 'import_bad_file');
  if (lines.length > 200) throw new ApiError(400, 'import_too_many');
  if (form.get('apply') !== '1') return { lines };
  const emails = new Set((ppl ?? []).map((p) => p.email as string | null).filter(Boolean));
  const results: { row: number; ok: boolean; code?: string }[] = [];
  for (const l of lines.filter((x) => x.input)) {
    const i = l.input!;
    if (i.email && emails.has(i.email)) { results.push({ row: l.row, ok: false, code: 'email_taken' }); continue; }
    try {
      const id = await createEmployee({ name: i.name, employeeNo: i.employeeNo, locale: 'ko', role: 'employee', joinedOn: i.joinedOn, phone: i.phone, jobTitle: i.jobTitle, groupId: i.groupId, createdBy: me.id });
      if (i.jobId || i.email) await db.from('profiles').update({ ...(i.jobId ? { job_id: i.jobId } : {}), ...(i.email ? { email: i.email } : {}), updated_by: me.id }).eq('id', id);
      if (i.email) emails.add(i.email);
      if (i.nationality || i.dormitory) await saveForeignInfo(id, { nationality: i.nationality, visaType: i.visaType, stayUntil: i.stayUntil, firstWorkInKorea: null, englishName: i.englishName, dormitory: i.dormitory }, me.id);
      await syncStaffHistorySafe(id, me.id);
      results.push({ row: l.row, ok: true });
    } catch (e) {
      results.push({ row: l.row, ok: false, code: e instanceof DuplicateEmployeeNo ? 'duplicate_no' : e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { lines, results };
});
