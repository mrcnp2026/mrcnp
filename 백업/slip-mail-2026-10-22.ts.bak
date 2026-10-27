// 급여명세서 메일 발송과 발송 기록 (DB 0059 payroll_slip_mails, 2026-10-19 의뢰인: 메일 발송 + 발송 기록).
// ★ 직원 「내 급여」에 지금 공개 중인 명세서만 보낸다 — 직원이 앱에서 보는 것과 같은 PDF를 붙인다(사업주 부담 줄은 빠진다).
// ★ 받는 주소는 직원 정보의 이메일(profiles.email). 없으면 보내지 않고 「이메일 없음」으로 남긴다.
// ★ 메일 본문에는 금액을 쓰지 않는다 — 금액은 첨부 PDF와 앱에만.
// ★ 첨부 PDF는 생년월일 6자리(YYMMDD)로 잠근다(AES-256, 개발-48 2026-10-19 의뢰인). 생년월일이 없으면 보내지 않고 「생년월일 없음」으로 남긴다.
// ★ 자동 발송 · 문자 · 알림톡은 하지 않는다(개발-49 2026-10-19 의뢰인) — 관리자가 단추를 눌러야 보낸다.
// ★ 보낼 때마다 결과를 한 줄씩 쌓는다(고치거나 지우지 않는다). 발송 여부 = 그 명세서의 마지막 줄.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { companyName } from '@/lib/company';
import { mailer, smtpReady } from '@/lib/mail';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMySlip } from './publish-data';
import { birthPassword, lockPdf } from './slip-lock';
import { asSlipTime, slipPdfBytes } from './slip-pdf-response';
import { payrollAudit } from './staff-data';

const db = () => createAdminClient();
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST204';

export type MailResult = 'SENT' | 'FAILED' | 'NO_EMAIL' | 'NO_BIRTH';
export type SlipMail = { id: number; slipId: string; employeeId: string; month: string; revision: number; toEmail: string | null; result: MailResult; errorCode: string | null; sentBy: string; at: string };
const toMail = (r: Record<string, unknown>): SlipMail => ({
  id: Number(r.id), slipId: r.slip_id as string, employeeId: r.employee_id as string, month: (r.pay_month as string).slice(0, 7), revision: r.revision as number,
  toEmail: (r.to_email as string | null) ?? null, result: r.result as MailResult, errorCode: (r.error_code as string | null) ?? null, sentBy: r.sent_by as string, at: r.created_at as string,
});

/** 명세서들의 발송 기록(새것부터). 표가 아직 없으면 null — 화면은 「DB 변경 필요」만 보인다 */
export async function loadSlipMails(slipIds: string[]): Promise<SlipMail[] | null> {
  if (slipIds.length === 0) {
    const { error } = await db().from('payroll_slip_mails').select('id').limit(1);
    return missingTable(error?.code) ? null : [];
  }
  const { data, error } = await db().from('payroll_slip_mails').select('*').in('slip_id', slipIds).order('id', { ascending: false }).limit(5000);
  if (missingTable(error?.code)) return null;
  if (error) throw new Error(`loadSlipMails: ${error.code}`);
  return (data ?? []).map(toMail);
}

/** 명세서마다 마지막 발송 결과 */
export function lastMailBySlip(mails: SlipMail[]): Map<string, SlipMail> {
  const out = new Map<string, SlipMail>();
  for (const m of mails) if (!out.has(m.slipId)) out.set(m.slipId, m); // 새것부터 왔다
  return out;
}

export const mailReady = smtpReady;

/** 직원마다 생년월일 (staff_details, 묶음 17) */
export async function birthDates(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db().from('staff_details').select('id, birth_date').in('id', ids);
  if (error) throw new Error(`birthDates: ${error.code}`);
  return new Map((data ?? []).filter((r) => r.birth_date).map((r) => [r.id as string, r.birth_date as string]));
}

const errCode = (e: unknown): string => {
  const x = e as { code?: string; responseCode?: number };
  return String(x?.responseCode ?? x?.code ?? 'send_failed').slice(0, 100);
};

/** 고른 명세서를 메일로 보낸다. 한 번에 MAX_PER_CALL장까지 — 화면이 나눠서 부른다(서버 시간 제한) */
export const MAX_PER_CALL = 10;
export async function mailSlips(args: { me: Me; items: { employeeId: string; slipId: string }[]; practice: boolean; origin: string; requestId: string }): Promise<{ sent: number; failed: number; noEmail: number; noBirth: number; skipped: number }> {
  if ((await loadSlipMails([])) === null) throw new ApiError(503, 'db_update_required');
  if (!smtpReady()) throw new ApiError(503, 'mail_not_configured');
  const ids = [...new Set(args.items.map((i) => i.employeeId))];
  const { data: people, error } = await db().from('profiles').select('id, name, email, employee_no, group_id').in('id', ids);
  if (error) throw new Error(`mailSlips.people: ${error.code}`);
  const who = new Map((people ?? []).map((p) => [p.id as string, p]));
  const births = await birthDates(ids);
  const [company, t] = await Promise.all([companyName(), getTranslations({ locale: 'ko', namespace: 'payslipMail' })]);
  const out = { sent: 0, failed: 0, noEmail: 0, noBirth: 0, skipped: 0 };
  const m = mailer();
  try {
    for (const it of args.items) {
      const p = who.get(it.employeeId);
      const found = p ? await loadMySlip(it.employeeId, it.slipId, args.practice) : null;
      if (!p || !found || !found.slip.current) {
        out.skipped++; // 공개 중이 아니다(회수 · 새 판으로 바뀜) — 보내지 않고 기록도 남기지 않는다
        continue;
      }
      const { slip, lines, time } = found;
      const base = { slip_kind: slip.kind === 'UPLOAD' ? 'UPLOAD' : 'CALC', slip_id: slip.id, employee_id: it.employeeId, pay_month: `${slip.month}-01`, revision: slip.revision, request_id: args.requestId, is_test: args.practice, sent_by: args.me.id };
      const email = ((p.email as string | null) ?? '').trim();
      const password = birthPassword(births.get(it.employeeId));
      let row: Record<string, unknown>;
      if (!email) {
        row = { ...base, to_email: null, result: 'NO_EMAIL' };
        out.noEmail++;
      } else if (!password) {
        row = { ...base, to_email: email, result: 'NO_BIRTH' };
        out.noBirth++;
      } else {
        try {
          const pdf = await slipPdfBytes({
            locale: 'ko', no: slip.no, name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, groupId: (p.group_id as string | null) ?? null, month: slip.month, periodFrom: slip.periodFrom, periodTo: slip.periodTo, payDate: slip.payDate, revision: slip.revision,
            pay: slip.pay, deduction: slip.deduction, net: slip.net, draft: false, practice: slip.isTest, correctionReason: slip.correctionReason, requestId: args.requestId, lines, time: asSlipTime(time),
          });
          const month = `${slip.month.slice(0, 4)}년 ${Number(slip.month.slice(5, 7))}월`;
          await m.send({
            fromName: company, to: email,
            subject: t(slip.kind === 'BONUS' ? 'subjectBonus' : 'subject', { company, month }) + (slip.revision > 1 ? t('subjectRevision', { n: slip.revision }) : ''),
            text: t('body', { name: p.name as string, month, payDate: slip.payDate, company, link: `${args.origin}/punch/payslips` }),
            attachments: [{ filename: pdf.file, content: Buffer.from(await lockPdf(pdf.bytes, password)), contentType: 'application/pdf' }],
          });
          row = { ...base, to_email: email, result: 'SENT' };
          out.sent++;
        } catch (e) {
          row = { ...base, to_email: email, result: 'FAILED', error_code: errCode(e) };
          out.failed++;
        }
      }
      const ins = await db().from('payroll_slip_mails').insert(row);
      if (ins.error) console.error(JSON.stringify({ route: 'slip-mail', code: 'log_failed', detail: ins.error.code }));
    }
  } finally {
    m.close();
  }
  await payrollAudit({ actorId: args.me.id, action: 'payslip.mail', table: 'payroll_slip_mails', requestId: args.requestId, detail: { ...out, count: args.items.length } });
  return out;
}
