// 백업 알림 메일 — 받는 사람은 최고관리자 이상준 한 명 (2026-10-16 의뢰인 결정)
// 앱 계정 이메일은 전화번호 형식(…@staff.invalid)이라 실제 주소를 설정값 BACKUP_ALERT_EMAIL로 받는다.
// 보내는 계정: SMTP_USER / SMTP_PASS (지메일이면 「앱 비밀번호」), SMTP_HOST 기본 smtp.gmail.com
import nodemailer from 'nodemailer';

export function mailConfigured(): boolean {
  return Boolean(process.env.BACKUP_ALERT_EMAIL && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendBackupMail(subject: string, lines: string[]): Promise<void> {
  const to = process.env.BACKUP_ALERT_EMAIL;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!to || !user || !pass) throw new Error('mail_not_configured');
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `근태관리 백업 <${user}>`,
    to,
    subject: `[근태관리] ${subject}`,
    text: lines.join('\n'),
  });
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
