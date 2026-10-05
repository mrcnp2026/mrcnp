// 초대 QR 발급·직원 추가. 서버 전용 (관리자 API와 비상 스크립트가 함께 쓴다).
import 'server-only';
import QRCode from 'qrcode';
import { OFFICE } from '@/config/office';
import { COLORS } from '@/config/theme';
import { formatInviteCode, newInviteCode } from '@/lib/invite-code';
import { hashToken } from '@/lib/passkey';
import { staffEmail } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Locale } from '@/i18n/locales';

export const EMPLOYEE_NO_RE = /^[A-Za-z0-9-]{1,20}$/;

export type IssuedInvite = { url: string; code: string; qrDataUrl: string; expiresAt: string };

/**
 * 새 초대를 만든다. 같은 직원의 쓰지 않은 이전 초대는 취소한다(revoked_at) — 유효한 QR이 여러 장 돌지 않게.
 * 토큰 원문은 이 응답에만 있고 DB에는 지문(sha256)만 남는다.
 */
export async function issueInvite(args: {
  employeeId: string;
  issuedBy: string | null;
  via: 'admin' | 'emergency';
}): Promise<IssuedInvite> {
  const db = createAdminClient();
  const now = new Date();
  const { error: e1 } = await db
    .from('invites')
    .update({ revoked_at: now.toISOString() })
    .eq('employee_id', args.employeeId)
    .is('used_at', null)
    .is('revoked_at', null);
  if (e1) throw new Error(`issueInvite.revoke: ${e1.message}`);

  const token = newInviteCode();
  const expiresAt = new Date(now.getTime() + OFFICE.inviteValidHours * 3_600_000);
  const { error: e2 } = await db.from('invites').insert({
    employee_id: args.employeeId,
    token_hash: hashToken(token),
    issued_via: args.via,
    issued_by: args.issuedBy,
    expires_at: expiresAt.toISOString(),
  });
  if (e2) throw new Error(`issueInvite.insert: ${e2.message}`);

  const url = `${OFFICE.appOrigin}/register?token=${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 2,
    width: 280,
    color: { dark: COLORS.text, light: COLORS.bg },
  });
  return { url, code: formatInviteCode(token), qrDataUrl, expiresAt: expiresAt.toISOString() };
}

export class DuplicateEmployeeNo extends Error {}

/** 직원 계정 + 직원 정보 만들기. 로그인 주소는 받는 사람이 없는 {사번}@staff.invalid (7-12 요점 5) */
export async function createEmployee(args: {
  name: string;
  employeeNo: string;
  locale: Locale;
  role: 'admin' | 'employee';
  joinedOn: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  groupId?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const db = createAdminClient();
  const { data: dup } = await db.from('profiles').select('id').eq('employee_no', args.employeeNo).maybeSingle();
  if (dup) throw new DuplicateEmployeeNo();

  const { data: u, error: e1 } = await db.auth.admin.createUser({ email: staffEmail(args.employeeNo), email_confirm: true });
  if (e1 || !u.user) {
    if (e1 && /already/i.test(e1.message)) throw new DuplicateEmployeeNo();
    throw new Error(`createEmployee.createUser: ${e1?.message}`);
  }
  const { error: e2 } = await db.from('profiles').insert({
    id: u.user.id,
    name: args.name,
    employee_no: args.employeeNo,
    role: args.role,
    locale: args.locale,
    joined_on: args.joinedOn,
    phone: args.phone ?? null,
    job_title: args.jobTitle ?? null,
    group_id: args.groupId ?? null,
    updated_by: args.createdBy ?? null,
  });
  if (e2) {
    // 직원 정보가 아직 없으므로 계정은 지워도 기록이 고아가 되지 않는다 (profiles가 생긴 뒤에는 지우지 않는다, 4-1)
    await db.auth.admin.deleteUser(u.user.id);
    if (e2.code === '23505') throw new DuplicateEmployeeNo();
    throw new Error(`createEmployee.profile: ${e2.message}`);
  }
  return u.user.id;
}
