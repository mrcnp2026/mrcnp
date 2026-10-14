// 사원별 급여(계약) 엑셀 — GET: 양식 받기(지금 값이 채워진 엑셀) · POST: 올린 파일 미리보기 / 적용. 급여 담당 관리자만.
// 적용은 바뀐 줄만, 한 줄씩 새 판으로 저장한다(화면에서 하나씩 고치는 것과 같은 길 — saveContract). 한 줄이 막혀도 나머지는 저장하고 줄마다 결과를 돌려준다.
// ★ 검사 계정은 검사 계정만, 실제 관리자는 실제 직원만 다룬다(서로의 줄은 「모르는 사번」).
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { api, ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { versionAt } from '@/lib/payroll/contract';
import { requirePayroll } from '@/lib/payroll/data';
import { isDate } from '@/lib/payroll/settings';
import { loadStaffPay, saveContract } from '@/lib/payroll/staff-data';
import { contractTemplate, IMPORT_COLS, readContractRows, sheetRows, type ImportLabels, type Person } from '@/lib/payroll/staff-import';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { isTestNo } from '@/lib/work-messages';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;

async function labels(): Promise<ImportLabels> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.staffPay' });
  return {
    sheet: t('imp.sheet'),
    guide: t('imp.guide'),
    cols: Object.fromEntries(IMPORT_COLS.map((c) => [c, t(`imp.col.${c}`)])) as ImportLabels['cols'],
    payType: { MONTHLY: t('payType.MONTHLY'), HOURLY: t('payType.HOURLY'), ANNUAL: t('payType.ANNUAL') },
    timeBasis: { ACTUAL: t('timeBasis.ACTUAL'), ROUNDED: t('timeBasis.ROUNDED'), SCHEDULE: t('timeBasis.SCHEDULE') },
  };
}

/** 다룰 직원 — 켜져 있는 직원(검사 계정끼리 · 실제끼리), 지금 계약과 마지막 판 번호 */
async function people(me: Me): Promise<Person[]> {
  const { data } = await createAdminClient().from('profiles').select('id, name, employee_no, active').eq('active', true).order('employee_no');
  const mine = (data ?? []).filter((p) => isTestNo(p.employee_no as string | null) === isTestNo(me.employeeNo));
  const today = toKstDate(new Date());
  return Promise.all(
    mine.map(async (p) => {
      const pay = await loadStaffPay(p.id as string);
      const now = versionAt(pay.contracts, today);
      return { id: p.id as string, employeeNo: p.employee_no as string | null, name: p.name as string, contract: now, version: pay.contracts[0]?.version ?? 0 };
    }),
  );
}

export async function GET(): Promise<Response> {
  let me: Me;
  try {
    me = await requirePayroll();
  } catch {
    return deny(403, 'forbidden');
  }
  const L = await labels();
  const wb = contractTemplate(await people(me), L);
  const fileName = `${L.sheet}.xlsx`;
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="contracts.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export const POST = api('admin.payroll.staff.import', async (req, ctx) => {
  const me = await requirePayroll();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  const L = await labels();
  const rows = await sheetRows(await file.arrayBuffer(), L);
  if (!rows) throw new ApiError(400, 'import_bad_file');
  const lines = readContractRows(rows, await people(me), L);
  if (form.get('apply') !== '1') return { lines };
  const validFrom = form.get('validFrom');
  if (!isDate(validFrom)) throw new ApiError(400, 'invalid_input');
  const results: { row: number; ok: boolean; code?: string; version?: number }[] = [];
  for (const l of lines.filter((x) => x.changed && x.input && x.employeeId)) {
    try {
      const saved = await saveContract({ employeeId: l.employeeId!, input: l.input!, validFrom, reason: l.expectedVersion > 0 ? 'excel import' : null, expectedVersion: l.expectedVersion, me, requestId: ctx.requestId });
      results.push({ row: l.row, ok: true, version: saved.version });
    } catch (e) {
      results.push({ row: l.row, ok: false, code: e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { lines, results };
});
