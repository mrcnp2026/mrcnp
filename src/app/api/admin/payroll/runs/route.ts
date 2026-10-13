// 급여대장 만들기 (PRD v1.3 18.3). 급여 담당 관리자만. 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { createRun } from '@/lib/payroll/run-data';

export const maxDuration = 60;

export const POST = api('admin.payroll.runs', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action !== 'create' || typeof b.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month)) throw new ApiError(400, 'invalid_input');
  const practice = OFFICE.practiceMode && b.live !== true;
  const run = await createRun({ ym: b.month, practice, me, requestId: ctx.requestId });
  return { id: run.id };
});
