// 연차 사용 촉진 — 오늘 자동으로 할 일 정하기 (2026-10-29 의뢰인: 「촉진 알림은 손으로가 아니라 자동으로 앱 푸시 · 메일로」). 순수함수.
// 매일 아침 정기 작업(/api/cron/leave-promotion)이 부른다. 보내기는 lib/leave-promotion-notify.ts가 한다.
//   ① 1차 자동 발송: 만들어 둔 촉진(초안)이 1차 통지 기간(lib/leave-promotion-schedule.ts)에 들어오면 보낸다. 2차 기한이 지나면 보내지 않는다(늦은 통지).
//   ② 직원 다시 알림: 통지를 받고 계획을 안 낸 직원에게 계획 마감 3일 전부터 마감일까지 한 번.
//   ③ 관리자 알림: 계획 마감이 지났는데 계획이 없는 직원이 있으면 — 마감 다음 날부터 한 번, 2차 기한 7일 전부터 한 번 더.
// 2차 통지(회사가 쓸 날짜를 정해 알림)는 날짜를 사람이 정해야 해서 자동으로 보내지 않는다 — 관리자에게 알리기만 한다.
// ★ 법정 기간 계산은 「임시」다(노무 확인 전, 검증 대기 기록). 자동 발송이 법적 촉진을 마쳤다는 뜻은 아니다.
import { addDaysIso, promotionSchedule, type PromotionKind } from '@/lib/leave-promotion-schedule';

export type AlertCampaign = { id: string; state: 'DRAFT' | 'SENT' | 'CLOSED'; planDueOn: string; periodEnd: string | null; leaveKind: PromotionKind | null };
export type AlertTarget = { id: string; campaignId: string; employeeId: string; state: string; secondSent: boolean };

export type PromotionAlerts = {
  autoSend: string[]; // 오늘 1차를 자동으로 보낼 촉진
  remindPlan: { campaignId: string; targetId: string; employeeId: string }[]; // 계획 내라고 다시 알릴 직원
  adminSecond: { campaignId: string; waiting: number; secondBy: string; stage: 'due' | 'soon' }[]; // 2차 통지를 보내라고 관리자에게
};

const REMIND_DAYS = 3;
const SOON_DAYS = 7;

export function planPromotionAlerts(campaigns: AlertCampaign[], targets: AlertTarget[], today: string): PromotionAlerts {
  const out: PromotionAlerts = { autoSend: [], remindPlan: [], adminSecond: [] };
  for (const c of campaigns) {
    if (!c.periodEnd) continue; // 사용기간을 넣지 않은 촉진은 법정 기간을 몰라 자동으로 하지 않는다
    const s = promotionSchedule(c.periodEnd, c.leaveKind ?? 'ANNUAL');
    const mine = targets.filter((t) => t.campaignId === c.id);
    if (c.state === 'DRAFT') {
      if (today >= s.firstFrom && today <= s.secondBy && mine.some((t) => t.state === 'CANDIDATE')) out.autoSend.push(c.id);
      continue;
    }
    if (c.state !== 'SENT') continue;
    if (today >= addDaysIso(c.planDueOn, -REMIND_DAYS) && today <= c.planDueOn) {
      for (const t of mine) if (t.state === 'NOTIFIED') out.remindPlan.push({ campaignId: c.id, targetId: t.id, employeeId: t.employeeId });
    }
    const waiting = mine.filter((t) => (t.state === 'NOTIFIED' || t.state === 'EXCEPTION') && !t.secondSent).length;
    if (waiting > 0 && today > c.planDueOn && today <= s.secondBy) {
      out.adminSecond.push({ campaignId: c.id, waiting, secondBy: s.secondBy, stage: today >= addDaysIso(s.secondBy, -SOON_DAYS) ? 'soon' : 'due' });
    }
  }
  return out;
}
