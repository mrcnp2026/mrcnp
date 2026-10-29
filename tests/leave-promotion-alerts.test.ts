import { describe, expect, it } from 'vitest';
import { planPromotionAlerts, type AlertCampaign, type AlertTarget } from '../src/lib/leave-promotion-alerts';

// 회계연도 연차(사용기간 끝 12-31): 1차 = 07-01 ~ 07-10, 2차 기한 = 10-31
const draft: AlertCampaign = { id: 'c1', state: 'DRAFT', planDueOn: '2026-07-20', periodEnd: '2026-12-31', leaveKind: 'ANNUAL' };
const sent: AlertCampaign = { ...draft, id: 'c2', state: 'SENT' };
const t = (id: string, campaignId: string, state: string, secondSent = false): AlertTarget => ({ id, campaignId, employeeId: `e-${id}`, state, secondSent });

describe('연차 촉진 자동 알림 계획', () => {
  it('초안은 1차 통지 기간이 시작되는 날부터 자동으로 보낸다', () => {
    const ts = [t('a', 'c1', 'CANDIDATE')];
    expect(planPromotionAlerts([draft], ts, '2026-06-30').autoSend).toEqual([]);
    expect(planPromotionAlerts([draft], ts, '2026-07-01').autoSend).toEqual(['c1']);
  });
  it('2차 기한이 지나면 늦은 1차는 보내지 않는다', () => {
    expect(planPromotionAlerts([draft], [t('a', 'c1', 'CANDIDATE')], '2026-11-01').autoSend).toEqual([]);
  });
  it('보낼 대상이 없거나 사용기간이 없는 초안은 건너뛴다', () => {
    expect(planPromotionAlerts([draft], [t('a', 'c1', 'EXCLUDED')], '2026-07-01').autoSend).toEqual([]);
    expect(planPromotionAlerts([{ ...draft, periodEnd: null }], [t('a', 'c1', 'CANDIDATE')], '2026-07-01').autoSend).toEqual([]);
  });
  it('계획을 안 낸 직원만 마감 3일 전부터 다시 알린다', () => {
    const ts = [t('a', 'c2', 'NOTIFIED'), t('b', 'c2', 'PLAN_SUBMITTED')];
    expect(planPromotionAlerts([sent], ts, '2026-07-16').remindPlan).toEqual([]);
    expect(planPromotionAlerts([sent], ts, '2026-07-17').remindPlan).toEqual([{ campaignId: 'c2', targetId: 'a', employeeId: 'e-a' }]);
    expect(planPromotionAlerts([sent], ts, '2026-07-21').remindPlan).toEqual([]);
  });
  it('계획 마감이 지나면 관리자에게 2차를 알리고, 기한 7일 전부터는 「곧」으로', () => {
    const ts = [t('a', 'c2', 'NOTIFIED'), t('b', 'c2', 'EXCEPTION'), t('c', 'c2', 'NOTIFIED', true), t('d', 'c2', 'CONFIRMED')];
    expect(planPromotionAlerts([sent], ts, '2026-07-20').adminSecond).toEqual([]);
    expect(planPromotionAlerts([sent], ts, '2026-07-21').adminSecond).toEqual([{ campaignId: 'c2', waiting: 2, secondBy: '2026-10-31', stage: 'due' }]);
    expect(planPromotionAlerts([sent], ts, '2026-10-24').adminSecond[0].stage).toBe('soon');
    expect(planPromotionAlerts([sent], ts, '2026-11-01').adminSecond).toEqual([]);
  });
});
