// 급여 순서 안내 (2026-10-14 의뢰인: 급여대장 · 일용직 · 사회보험 · 퇴직급여가 「무엇을 어디에 넣고 어떻게 이어지는지」 보여야 한다)
// 정규 급여: ① 사원별 급여(계약 · 세무) → ② 근태 마감 → ③ 급여대장(만들기 · 계산 · 검토 · 확정) → ④ 공개(직원 명세서) → ⑤ 사회보험 대조 · 인건비 현황
// 일용직:   ① 대상자 등록 → ② 고용 기간(현장 · 일당 · 세금 조건) → ③ 근무 입력(날짜별) → ④ 일용 대장(기간을 고르면 그 기간 근무가 있는 사람 전원 계산)
import { getTranslations } from 'next-intl/server';
import { Steps, type Step } from './listframe';

export async function PayFlow({ now }: { now: 'staff' | 'close' | 'check' | 'runs' | 'publish' | 'insurance' | 'labor' | 'after' }) {
  const t = await getTranslations('payFlow');
  const order = ['staff', 'close', 'check', 'runs', 'publish', 'insurance', 'labor'] as const;
  const at = order.indexOf(now === 'after' ? 'insurance' : now);
  // 2026-10-25 의뢰인: 「명세서 공개 · 보험 대조를 어디서 어떻게 보는지 모르겠다」 → 단계를 6개로 나누고, 각 단계가 가는 곳을 정확히 가리킨다
  const href = { staff: '/admin/payroll/staff', close: '/admin/closing', check: '/admin/payroll/check', runs: '/admin/payroll/runs', publish: '/admin/payroll/runs?st=FINALIZED', insurance: '/admin/payroll/insurance?v=notice', labor: '/admin/payroll/labor-cost' };
  const steps: Step[] = order.map((k, i) => ({ key: k, label: t(`regular.${k}`), note: t(`regular.${k}Note`), href: href[k], state: i === at ? 'now' : 'todo' }));
  return <Steps label={t('regularLabel')} steps={steps} />;
}

export async function DailyFlow({ now }: { now: 'payees' | 'work' | 'runs' }) {
  const t = await getTranslations('payFlow');
  const steps: Step[] = [
    { key: 'payee', label: t('daily.payee'), note: t('daily.payeeNote'), href: '/admin/payroll/daily?v=payees', state: now === 'payees' ? 'now' : 'todo' },
    { key: 'eng', label: t('daily.engagement'), note: t('daily.engagementNote'), href: '/admin/payroll/daily?v=payees', state: now === 'payees' ? 'now' : 'todo' },
    { key: 'work', label: t('daily.work'), note: t('daily.workNote'), href: '/admin/payroll/daily?v=work', state: now === 'work' ? 'now' : 'todo' },
    { key: 'run', label: t('daily.run'), note: t('daily.runNote'), href: '/admin/payroll/daily?v=runs', state: now === 'runs' ? 'now' : 'todo' },
  ];
  return <Steps label={t('dailyLabel')} steps={steps} />;
}
