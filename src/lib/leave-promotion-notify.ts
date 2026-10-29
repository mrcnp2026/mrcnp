// 연차 사용 촉진 알림 보내기 — 폰 알림 + 메일 (2026-10-29 의뢰인: 「손으로가 아니라 자동으로 앱 푸시 또는 메일 발송」). 서버 전용.
// 앱 안 업무 메시지(lib/work-messages)는 그대로 가고, 여기서 폰 알림과 메일을 더한다.
// ★ 메일은 급여명세서 · 백업과 같은 계정(lib/mail.ts — Vercel 환경 변수 SMTP_USER · SMTP_PASS, 지메일이면 앱 비밀번호)으로 보낸다.
//   키가 없으면 메일만 건너뛴다(폰 알림 · 업무 메시지는 그대로). 받는 주소는 직원 정보의 이메일(profiles.email), 없으면 보내지 않는다.
// ★ 폰 알림은 통합설정 › 알림의 「폰 알림」 스위치를 따른다. 연습 모드 · 검사 계정(e2e-)에는 보내지 않는다.
// ★ 같은 알림은 한 번만(push_sent 열쇠 — 폰 · 메일 따로). 실패해도 촉진 처리 자체는 막지 않는다(로그만 남긴다).
import 'server-only';
import { OFFICE } from '@/config/office';
import { companyName } from '@/lib/company';
import { loadCampaign, sendCampaign } from '@/lib/leave-promotion';
import { planPromotionAlerts, type AlertCampaign, type AlertTarget } from '@/lib/leave-promotion-alerts';
import { mailer, smtpReady } from '@/lib/mail';
import { firstTime, pushConfigured, sendPush } from '@/lib/push';
import { staffPushFilter } from '@/lib/push-recipients';
import { createAdminClient } from '@/lib/supabase/admin';
import { switchOn } from '@/lib/switches';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';

type Note = { key: string; title: string; body: string; path: string };
type Person = { id: string; email: string | null };

const log = (code: string, detail: unknown) => console.error(JSON.stringify({ route: 'promotion.notify', code, detail: String((detail as Error)?.message ?? detail).slice(0, 200) }));
const origin = () => (process.env.APP_ORIGIN || 'http://localhost:4123').replace(/\/$/, '');

async function people(ids: string[]): Promise<Person[]> {
  if (ids.length === 0) return [];
  const { data } = await createAdminClient().from('profiles').select('id, email, active, employee_no').in('id', [...new Set(ids)]);
  return (data ?? []).filter((p) => p.active && !String(p.employee_no ?? '').startsWith('e2e-')).map((p) => ({ id: p.id as string, email: (p.email as string | null) ?? null }));
}

/** 사람마다 폰 알림 + 메일. 열쇠는 note.key + 받는 사람 */
async function deliver(to: Person[], note: Note): Promise<{ push: number; mail: number }> {
  let push = 0, mail = 0;
  if (to.length === 0 || OFFICE.practiceMode) return { push, mail };
  const pushOk = pushConfigured() && (await switchOn('notify.push').catch(() => false));
  const link = `${origin()}${note.path}`;
  const m = smtpReady() ? mailer() : null;
  const company = m ? await companyName() : '';
  try {
    for (const p of to) {
      if (pushOk && (await firstTime(`${note.key}:push:${p.id}`))) {
        push += await sendPush([p.id], { title: note.title, body: note.body.slice(0, 120), url: note.path, tag: note.key }).catch((e) => (log('push_failed', e), 0));
      }
      if (m && p.email && (await firstTime(`${note.key}:mail:${p.id}`))) {
        try {
          await m.send({ fromName: company, to: p.email, subject: note.title, text: `${note.body}\n\n${link}\n\n— ${company}` });
          mail++;
        } catch (e) {
          log('mail_failed', e);
        }
      }
    }
  } finally {
    m?.close();
  }
  return { push, mail };
}

/** 최고관리자(알림-9 규칙을 거친 사람) — 시스템관리자 · 검사 계정 제외 */
async function admins(): Promise<Person[]> {
  const { data } = await createAdminClient().from('profiles').select('id').eq('role', 'admin').eq('active', true).or(NOT_SYSTEM_ADMIN);
  const ids = await staffPushFilter((data ?? []).map((p) => p.id as string));
  return people(ids);
}

/** 1차 통지를 보낸 직원들에게 — 촉진 제목과 안내문 그대로. 수동으로 보내든 자동으로 보내든 같다 */
export async function notifyFirst(campaignId: string, targetIds: string[]): Promise<void> {
  try {
    const x = await loadCampaign(campaignId);
    if (!x || targetIds.length === 0) return;
    for (const t of x.targets.filter((y) => targetIds.includes(y.id))) {
      await deliver(await people([t.employeeId]), { key: `promo1:${t.id}`, title: x.campaign.title, body: `${x.campaign.noticeBody}\n\n사용 계획 제출 기한: ${x.campaign.planDueOn}`, path: `/punch/leave/promotion/${t.id}` });
    }
  } catch (e) {
    log('first_failed', e);
  }
}

/** 2차 통지(회사가 정한 사용 시기)를 받은 직원에게 — 업무 메시지와 같은 제목 · 본문 */
export async function notifySecond(targetId: string, employeeId: string, title: string, body: string): Promise<void> {
  try {
    await deliver(await people([employeeId]), { key: `promo2:${targetId}`, title, body, path: `/punch/leave/promotion/${targetId}` });
  } catch (e) {
    log('second_failed', e);
  }
}

/** 매일 아침 정기 작업 — 1차 자동 발송 · 계획 다시 알림 · 관리자에게 2차 알림 (판단은 lib/leave-promotion-alerts.ts) */
export async function runPromotionAutomation(today: string): Promise<{ autoSent: number; reminded: number; adminAlerts: number }> {
  const db = createAdminClient();
  const res = { autoSent: 0, reminded: 0, adminAlerts: 0 };
  if (OFFICE.practiceMode) return res;
  const { data: cs, error } = await db.from('leave_promotion_campaigns').select('id, title, state, plan_due_on, period_end, leave_kind, created_by').eq('is_test', false).in('state', ['DRAFT', 'SENT']);
  if (error) throw new Error(`promotion.campaigns: ${error.code}`);
  if (!cs?.length) return res;
  const { data: ts, error: te } = await db.from('leave_promotion_targets').select('id, campaign_id, employee_id, state, second_message_id').in('campaign_id', cs.map((c) => c.id as string));
  if (te) throw new Error(`promotion.targets: ${te.code}`);
  const campaigns: AlertCampaign[] = cs.map((c) => ({ id: c.id as string, state: c.state as AlertCampaign['state'], planDueOn: c.plan_due_on as string, periodEnd: (c.period_end as string | null) ?? null, leaveKind: (c.leave_kind as AlertCampaign['leaveKind']) ?? null }));
  const targets: AlertTarget[] = (ts ?? []).map((t) => ({ id: t.id as string, campaignId: t.campaign_id as string, employeeId: t.employee_id as string, state: t.state as string, secondSent: Boolean(t.second_message_id) }));
  const plan = planPromotionAlerts(campaigns, targets, today);
  const titleOf = new Map(cs.map((c) => [c.id as string, c.title as string]));

  // ① 1차 자동 발송 — 보낸 사람은 촉진을 만든 관리자로 남긴다
  for (const id of plan.autoSend) {
    const c = cs.find((x) => x.id === id)!;
    try {
      const r = await sendCampaign({ campaignId: id, sender: { id: c.created_by as string, employeeNo: null }, hrefOf: (tid) => `/punch/leave/promotion/${tid}` });
      res.autoSent += r.sent;
      await notifyFirst(id, r.targetIds);
      await deliver(await admins(), { key: `promo-auto:${id}`, title: `연차 촉진 1차 통지를 자동으로 보냈습니다`, body: `${titleOf.get(id)} — ${r.sent}명`, path: `/admin/leave/promotion/${id}` });
    } catch (e) {
      log('auto_send_failed', e);
    }
  }
  // ② 계획을 안 낸 직원 다시 알림
  for (const r of plan.remindPlan) {
    const c = cs.find((x) => x.id === r.campaignId)!;
    const sent = await deliver(await people([r.employeeId]), { key: `promo-remind:${r.targetId}`, title: `연차 사용 계획을 내 주세요`, body: `${c.title} — 제출 기한 ${c.plan_due_on}`, path: `/punch/leave/promotion/${r.targetId}` });
    res.reminded += sent.push + sent.mail > 0 ? 1 : 0;
  }
  // ③ 관리자에게 2차 통지 알림
  for (const a of plan.adminSecond) {
    const sent = await deliver(await admins(), {
      key: `promo-second-${a.stage}:${a.campaignId}`,
      title: a.stage === 'soon' ? `연차 촉진 2차 통지 기한이 다가옵니다` : `연차 촉진 2차 통지를 보낼 차례입니다`,
      body: `${titleOf.get(a.campaignId)} — 계획을 내지 않은 직원 ${a.waiting}명, ${a.secondBy}까지 사용 시기를 정해 알려야 합니다`,
      path: `/admin/leave/promotion/${a.campaignId}`,
    });
    res.adminAlerts += sent.push + sent.mail > 0 ? 1 : 0;
  }
  return res;
}
