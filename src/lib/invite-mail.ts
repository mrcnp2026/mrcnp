// 가입 안내 메일 (2026-10-26 의뢰인: 카톡 · 문자 서비스가 아직 없다 — 지금은 메일이 가장 유연하다).
// 관리자가 초대 창에서 [이메일로 보내기]를 누르면 직원 정보의 이메일로 링크 · 코드를 보낸다. 본문에 금액 같은 민감한 값은 없다.
// 보낼 때 받은 코드가 그 직원의 아직 쓰지 않은 초대인지 서버가 다시 확인한다 — 화면이 준 링크를 그대로 믿지 않는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { issueInvite } from '@/lib/invite';
import { hashToken } from '@/lib/passkey';
import { mailer, smtpReady } from '@/lib/mail';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');


/** 가입 안내 메일 한 통의 제목 · 본문 — 한 명씩 보낼 때와 한꺼번에 보낼 때 같은 글을 쓴다 */
function inviteMailMessage(a: { name: string; to: string; url: string; code: string; expiresAt: string }) {
  const until = new Date(a.expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  return {
    fromName: 'MRCNP 근태',
    to: a.to,
    subject: `[MRCNP 근태] ${a.name}님 가입 안내 / Sign-up`,
    text: [
      `${a.name}님, 근태 앱 가입 안내입니다.`,
      `아래 링크를 열어 비밀번호를 정해 주세요(8자 이상). 유효: ${until}까지`,
      a.url,
      `링크가 열리지 않으면 주소창에 ${OFFICE.appOrigin.replace(/^https?:\/\//, '')} 입력 → 「비밀번호 설정」 → 코드 ${a.code}`,
      '',
      `Hi ${a.name}, open the link above to create your password (8+ characters). Code: ${a.code}`,
    ].join('\n'),
  };
}

/**
 * 아직 가입하지 않은 직원 — 직원 목록의 「미합류」와 같은 기준: 켜져 있고, 비밀번호도 폰 등록도 없는 사람. 시스템관리자 · 검사 계정은 뺀다.
 * 화면(버튼 숫자)과 발송이 같은 함수를 쓴다.
 */
export async function listUninvited(): Promise<{ id: string; name: string; email: string | null }[]> {
  const db = createAdminClient();
  const [{ data: people }, { data: keys }] = await Promise.all([
    db.from('profiles').select('id, name, email, employee_no, password_set_at').or(NOT_SYSTEM_ADMIN).eq('active', true).order('name'),
    db.from('user_passkeys').select('employee_id').is('revoked_at', null),
  ]);
  const withKey = new Set((keys ?? []).map((k) => k.employee_id as string));
  return (people ?? [])
    .filter((p) => !p.password_set_at && !withKey.has(p.id as string) && !(p.employee_no as string | null)?.startsWith('e2e-'))
    .map((p) => ({ id: p.id as string, name: p.name as string, email: (p.email as string | null) || null }));
}

export type BulkInviteResult = { sent: number; noEmail: string[]; failed: string[] };

/** 미가입 직원 모두에게 새 초대를 만들어 이메일로 보낸다 (2026-10-26 의뢰인). 이메일이 없는 사람은 이름만 돌려준다. 이전에 보낸 초대는 새 초대로 대체된다 */
export async function sendInviteMailAll(args: { me: Me }): Promise<BulkInviteResult> {
  if (!smtpReady()) throw new ApiError(503, 'mail_not_configured');
  const targets = await listUninvited();
  const out: BulkInviteResult = { sent: 0, noEmail: [], failed: [] };
  const m = mailer();
  try {
    for (const t of targets) {
      if (!t.email) {
        out.noEmail.push(t.name);
        continue;
      }
      try {
        const inv = await issueInvite({ employeeId: t.id, issuedBy: args.me.id, via: 'admin' });
        await m.send(inviteMailMessage({ name: t.name, to: t.email, url: inv.url, code: inv.code, expiresAt: inv.expiresAt }));
        out.sent += 1;
      } catch {
        out.failed.push(t.name);
      }
    }
  } finally {
    m.close();
  }
  return out;
}

export async function sendInviteMail(args: { employeeId: string; code: unknown }): Promise<{ to: string }> {
  const raw = typeof args.code === 'string' ? args.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  if (raw.length < 6 || raw.length > 20) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const { data: p } = await db.from('profiles').select('id, name, email, locale, active').eq('id', args.employeeId).maybeSingle();
  if (!p || !p.active) throw new ApiError(404, 'employee_inactive');
  if (!p.email) throw new ApiError(409, 'no_email');
  const { data: inv } = await db
    .from('invites')
    .select('id, expires_at')
    .eq('employee_id', args.employeeId)
    .eq('token_hash', hashToken(raw))
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!inv) throw new ApiError(409, 'invite_expired');
  if (!smtpReady()) throw new ApiError(503, 'mail_not_configured');

  const m = mailer();
  try {
    await m.send(inviteMailMessage({ name: String(p.name), to: String(p.email), url: `${OFFICE.appOrigin}/register?token=${raw}`, code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: inv.expires_at as string }));
  } finally {
    m.close();
  }
  return { to: maskEmail(String(p.email)) };
}
