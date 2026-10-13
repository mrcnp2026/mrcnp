// 급여대장 만들기 (PRD v1.3 18.3). 급여 담당 관리자만. 연습/운영은 서버가 정한다.
import { api, ApiError, readJson } from '@/lib/api';
import { OFFICE } from '@/config/office';
import { requirePayroll } from '@/lib/payroll/data';
import { createRun } from '@/lib/payroll/run-data';
import { isDate } from '@/lib/payroll/settings';

export const maxDuration = 60;

export const POST = api('admin.payroll.runs', async (req, ctx) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action !== 'create' || typeof b.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month)) throw new ApiError(400, 'invalid_input');
  const kind = b.kind === undefined || b.kind === 'REGULAR' ? 'REGULAR' : b.kind === 'BONUS' ? 'BONUS' : null;
  const title = b.title === undefined || b.title === null || b.title === '' ? null : typeof b.title === 'string' && b.title.trim().length <= 80 ? b.title.trim() : undefined;
  if (!kind || title === undefined) throw new ApiError(400, 'invalid_input');
  if (title?.toLowerCase().startsWith('e2e-') && !me.employeeNo?.startsWith('e2e-')) throw new ApiError(400, 'invalid_input'); // 검사용으로 숨기는 이름
  // 상여는 지급일을 직접 정한다(정규 대장은 급여대장 설정의 지급일)
  if (kind === 'BONUS' && !isDate(b.payDate)) throw new ApiError(400, 'payroll_pay_date');
  const practice = OFFICE.practiceMode && b.live !== true;
  const run = await createRun({ ym: b.month, kind, payDate: kind === 'BONUS' ? (b.payDate as string) : undefined, title, practice, me, requestId: ctx.requestId });
  return { id: run.id };
});
