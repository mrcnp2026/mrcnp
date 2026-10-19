// 백업 알림 메일 — 받는 사람은 최고관리자 이상준 한 명 (2026-10-16 의뢰인 결정)
// 앱 계정 이메일은 전화번호 형식(…@staff.invalid)이라 실제 주소를 설정값 BACKUP_ALERT_EMAIL로 받는다.
// 보내는 계정은 급여명세서 발송과 같다(lib/mail.ts).
import { mailer, smtpReady } from '@/lib/mail';

export function mailConfigured(): boolean {
  return Boolean(process.env.BACKUP_ALERT_EMAIL) && smtpReady();
}

export async function sendBackupMail(subject: string, lines: string[]): Promise<void> {
  const to = process.env.BACKUP_ALERT_EMAIL;
  if (!to || !smtpReady()) throw new Error('mail_not_configured');
  const m = mailer();
  try {
    await m.send({ fromName: '근태관리 백업', to, subject: `[근태관리] ${subject}`, text: lines.join('\n') });
  } finally {
    m.close();
  }
}

export function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function kstDate(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function kstTime(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}
