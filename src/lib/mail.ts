// 메일 보내기 — 백업 알림과 급여명세서 발송이 같은 계정을 쓴다.
// 보내는 계정: SMTP_USER / SMTP_PASS (지메일이면 「앱 비밀번호」 16자리), SMTP_HOST 기본 smtp.gmail.com, SMTP_PORT 기본 465
import 'server-only';
import nodemailer from 'nodemailer';

export function smtpReady(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** 한 번의 발송 묶음에 하나 — 여러 통을 보낼 때 연결을 다시 맺지 않는다 */
export function mailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('mail_not_configured');
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'smtp.gmail.com', port, secure: port === 465, auth: { user, pass } });
  return {
    send: (m: { fromName: string; to: string; subject: string; text: string; html?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }) =>
      transport.sendMail({ from: { name: m.fromName, address: user }, to: m.to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments }),
    close: () => transport.close(),
  };
}
