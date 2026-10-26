// 직원 정보 고치기 (관리자): 이름·사번·휴대폰·직무/직급·소속 그룹·화면 언어·입사일.
// 권한(관리자·급여 담당자)과 재직 상태는 여기서 바꾸지 않는다 — 따로 규칙이 있는 길로만 (R-2).
// 고친 사람은 updated_by → 변경 기록(audit_row)에 남는다.
import { isLocale } from '@/i18n/locales';
import { api, ApiError, readJson } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { requireAdmin } from '@/lib/auth';
import { EMPLOYEE_NO_RE } from '@/lib/invite';
import { cleanJobTitle, cleanPhone } from '@/lib/org';
import { cleanEmail } from '@/lib/email-rules';
import { assignableGroup } from '@/lib/org-data';
import { staffEmail } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { syncStaffHistorySafe } from '@/lib/staff-history';

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.profile', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  await assertStaffTarget(me.id, id);
  const b = await readJson(req);
  const db = createAdminClient();
  const { data: cur } = await db.from('profiles').select('id, employee_no').eq('id', id).maybeSingle();
  if (!cur) throw new ApiError(404, 'not_found');

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const employeeNo = typeof b.employeeNo === 'string' ? b.employeeNo.trim() : '';
  if (!name || name.length > 50) throw new ApiError(400, 'invalid_name');
  if (!EMPLOYEE_NO_RE.test(employeeNo)) throw new ApiError(400, 'invalid_no');
  if (!isLocale(b.locale)) throw new ApiError(400, 'invalid_input');
  const phone = cleanPhone(b.phone);
  if (phone === undefined) throw new ApiError(400, 'invalid_phone');
  const jobTitle = cleanJobTitle(b.jobTitle);
  if (jobTitle === undefined) throw new ApiError(400, 'invalid_input');
  // 이메일(선택, 로그인 아이디) — 비우면 이메일로는 로그인하지 않는다
  const email = typeof b.email === 'string' && b.email.trim() ? cleanEmail(b.email) : null;
  if (email === null && typeof b.email === 'string' && b.email.trim()) throw new ApiError(400, 'invalid_email');
  if (email) {
    const [{ data: other }, { data: pend }] = await Promise.all([
      db.from('profiles').select('id').eq('email', email).neq('id', id).maybeSingle(),
      db.from('signup_requests').select('id').eq('email', email).eq('status', 'pending').maybeSingle(),
    ]);
    if (other || pend) throw new ApiError(409, 'email_taken');
  }
  const groupId = await assignableGroup(b.groupId);
  if (groupId === undefined) throw new ApiError(400, 'invalid_group');
  const joinedOn =
    b.joinedOn === null || b.joinedOn === '' || b.joinedOn === undefined
      ? null
      : typeof b.joinedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.joinedOn)
        ? b.joinedOn
        : undefined;
  if (joinedOn === undefined) throw new ApiError(400, 'invalid_input');
  if (joinedOn && (joinedOn > toKstDate(new Date()) || joinedOn < '1970-01-01')) throw new ApiError(400, 'invalid_date');

  // 직무(선택) — 안 보내면 그대로, 빈 값이면 비운다
  let jobId: string | null | undefined;
  if (typeof b.jobId === 'string') {
    jobId = b.jobId || null;
    if (jobId) {
      const { data: job } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle();
      if (!job) throw new ApiError(400, 'invalid_input');
    }
  }

  // 사번이 바뀌면 로그인 계정의 주소({사번}@staff.invalid)도 함께 바꾼다 — 안 바꾸면 옛 사번을 새 직원에게 줄 수 없다
  if (employeeNo !== cur.employee_no) {
    const { data: dup } = await db.from('profiles').select('id').eq('employee_no', employeeNo).neq('id', id).maybeSingle();
    if (dup) throw new ApiError(409, 'duplicate_no');
    const { error: e1 } = await db.auth.admin.updateUserById(id, { email: staffEmail(employeeNo), email_confirm: true });
    if (e1) {
      if (/already|registered|exists/i.test(e1.message)) throw new ApiError(409, 'duplicate_no');
      throw new Error(`profile.email: ${e1.message}`);
    }
  }
  const { error } = await db
    .from('profiles')
    .update({ name, employee_no: employeeNo, phone, email, job_title: jobTitle, group_id: groupId, locale: b.locale, joined_on: joinedOn, ...(jobId !== undefined ? { job_id: jobId } : {}), updated_by: me.id })
    .eq('id', id);
  if (error?.code === '23505') throw new ApiError(409, 'duplicate_no');
  if (error) throw new Error(`profile.update: ${error.code}`);
  await syncStaffHistorySafe(id, me.id);
  return { ok: true };
});
