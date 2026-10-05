// 직원 추가 + 첫 초대 QR (게이트 3 "직원 등록"). 관리자만. 관리자 권한 부여는 여기서 하지 않는다 —
// 두 번째 관리자 확인이 필요한 일이라 ②(R-2의 8)에서 만든다. 지금 관리자는 비상 스크립트로만 생긴다.
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { createEmployee, DuplicateEmployeeNo, EMPLOYEE_NO_RE, issueInvite } from '@/lib/invite';
import { isLocale } from '@/i18n/locales';
import { cleanJobTitle, cleanPhone } from '@/lib/org';
import { assignableGroup } from '@/lib/org-data';

export const POST = api('admin.employees.create', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const employeeNo = typeof b.employeeNo === 'string' ? b.employeeNo.trim() : '';
  const joinedOn = typeof b.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.joinedOn) ? b.joinedOn : null;
  if (!name || name.length > 50) throw new ApiError(400, 'invalid_name');
  if (!EMPLOYEE_NO_RE.test(employeeNo)) throw new ApiError(400, 'invalid_no');
  if (!isLocale(b.locale)) throw new ApiError(400, 'invalid_input');
  const phone = cleanPhone(b.phone);
  if (phone === undefined) throw new ApiError(400, 'invalid_phone');
  const jobTitle = cleanJobTitle(b.jobTitle);
  if (jobTitle === undefined) throw new ApiError(400, 'invalid_input');
  const groupId = await assignableGroup(b.groupId);
  if (groupId === undefined) throw new ApiError(400, 'invalid_group');

  let employeeId: string;
  try {
    employeeId = await createEmployee({ name, employeeNo, locale: b.locale, role: 'employee', joinedOn, phone, jobTitle, groupId, createdBy: me.id });
  } catch (e) {
    if (e instanceof DuplicateEmployeeNo) throw new ApiError(409, 'duplicate_no');
    throw e;
  }
  const invite = await issueInvite({ employeeId, issuedBy: me.id, via: 'admin' });
  return { employeeId, name, invite };
});
