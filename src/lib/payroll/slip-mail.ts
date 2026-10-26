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

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** 명세서 메일 본문(HTML) — 금액은 쓰지 않는다. 메일 앱은 CSS가 약해 표와 인라인 스타일로 쓴다 */
function slipHtml(v: { title: string; lead: string; button: string; link: string; pwd: string; safe: string; foot: string; company: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6fa;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;font-family:-apple-system,'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;color:#1f2937;">
<tr><td style="padding:28px 28px 8px;font-size:13px;color:#6b7280;">${esc(v.company)}</td></tr>
<tr><td style="padding:0 28px 8px;font-size:20px;font-weight:700;line-height:1.4;">${esc(v.title)}</td></tr>
<tr><td style="padding:0 28px 20px;font-size:14px;line-height:1.7;color:#374151;">${esc(v.lead)}</td></tr>
<tr><td style="padding:0 28px 20px;"><a href="${esc(v.link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:8px;">${esc(v.button)}</a></td></tr>
<tr><td style="padding:0 28px 16px;font-size:13px;line-height:1.6;color:#374151;background:#ffffff;"><div style="background:#f4f6fa;border-radius:8px;padding:12px 14px;">${esc(v.pwd)}</div></td></tr>
<tr><td style="padding:0 28px 8px;font-size:12px;line-height:1.6;color:#6b7280;">${esc(v.safe)}</td></tr>
<tr><td style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:#9ca3af;">${esc(v.foot)}</td></tr>
</table></td></tr></table></body></html>`;
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
  const { data: people, error } = await db().from('profiles').select('id, name, email, employee_no, group_id, locale').in('id', ids);
  if (error) throw new Error(`mailSlips.people: ${error.code}`);
  const who = new Map((people ?? []).map((p) => [p.id as string, p]));
  const births = await birthDates(ids);
  // 메일 · PDF는 직원의 앱 언어로 (2026-10-22 의뢰인: 「외국인은 영어만 쓴다」) — 한국어가 아니면 영어(태국어 · 베트남어는 명세서 번역이 없다)
  const [company, tKo, tEn] = await Promise.all([companyName(), getTranslations({ locale: 'ko', namespace: 'payslipMail' }), getTranslations({ locale: 'en', namespace: 'payslipMail' })]);
  const langOf = (p: Record<string, unknown>) => (p.locale === 'ko' || !p.locale ? 'ko' : 'en');
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
      const lang = langOf(p);
      const t = lang === 'ko' ? tKo : tEn;
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
            locale: lang, no: slip.no, name: p.name as string, employeeNo: (p.employee_no as string | null) ?? null, groupId: (p.group_id as string | null) ?? null, month: slip.month, periodFrom: slip.periodFrom, periodTo: slip.periodTo, payDate: slip.payDate, revision: slip.revision,
            pay: slip.pay, deduction: slip.deduction, net: slip.net, draft: false, practice: slip.isTest, correctionReason: slip.correctionReason, requestId: args.requestId, tax: found.tax ?? null, lines, time: asSlipTime(time),
          });
          const month = lang === 'ko' ? `${slip.month.slice(0, 4)}년 ${Number(slip.month.slice(5, 7))}월` : new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${slip.month}-15T00:00:00Z`));
          const link = `${args.origin}/punch/payslips?m=${slip.month}`; // 로그인 뒤 그 달 명세서가 바로 열린다 (토큰 없음)
          const x = { name: p.name as string, month, payDate: slip.payDate, company, link };
          await m.send({
            fromName: company, to: email,
            subject: t(slip.kind === 'BONUS' ? 'subjectBonus' : 'subject', { company, month }) + (slip.revision > 1 ? t('subjectRevision', { n: slip.revision }) : ''),
            text: t('body', x),
            html: slipHtml({ title: t('htmlTitle', x), lead: t('htmlLead', x), button: t('button'), link, pwd: t('htmlPwd'), safe: t('htmlSafe'), foot: t('htmlFoot'), company }),
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

/**
 * 공개와 함께 메일도 보낸다 (2026-10-24 의뢰인 — 개발-49의 「관리자가 단추를 눌러야 보낸다」를 「공개할 때 같이」로 바꿈).
 * 공개 API가 응답을 돌려준 뒤(after) 부른다. 메일 설정이 없거나 표가 없으면 조용히 건너뛴다(공개는 이미 끝났다).
 * 이미 보낸(마지막 기록이 SENT) 명세서는 다시 보내지 않는다. 결과는 평소처럼 발송 기록에 쌓이고, 실패 · 이메일 없음 · 생년월일 없음은 화면에서 다시 보낼 수 있다.
 */
export async function mailPublished(args: { me: Me; items: { employeeId: string; slipId: string }[]; practice: boolean; origin: string; requestId: string }): Promise<void> {
  try {
    if (!smtpReady() || args.items.length === 0) return;
    const last = lastMailBySlip((await loadSlipMails(args.items.map((i) => i.slipId))) ?? []);
    const todo = args.items.filter((i) => last.get(i.slipId)?.result !== 'SENT');
    for (let i = 0; i < todo.length; i += MAX_PER_CALL) await mailSlips({ ...args, items: todo.slice(i, i + MAX_PER_CALL) });
  } catch (e) {
    console.error(JSON.stringify({ route: 'slip-mail', code: 'auto_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
}
