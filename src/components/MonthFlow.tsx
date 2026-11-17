// 근태 점검 → 근태 마감 → 급여대장 — 세 화면 맨 위의 같은 순서 줄 (2026-11-17 화면 법칙 B5 「이어짐」, 결정 급여-68 순서).
// 각 화면이 이미 읽은 숫자만 받는다(이 줄 때문에 DB를 더 읽지 않는다). 급여대장은 그 달 대장을 바로 연다 — 없으면 목록.
import { getTranslations } from 'next-intl/server';
import { Steps, type Step } from '@/components/listframe';

type Key = 'check' | 'closing' | 'run';

export async function MonthFlow({ month, live, now, runId, done = [], notes = {} }: { month: string; live: boolean; now: Key; runId: string | null; done?: Key[]; notes?: Partial<Record<Key, string>> }) {
  const t = await getTranslations('admin.monthFlow');
  const q = live ? '&live=1' : '';
  const href: Record<Key, string> = {
    check: `/admin/attendance-check?m=${month}${q}`,
    closing: `/admin/closing?m=${month}${q}`,
    run: runHref(runId, live),
  };
  const steps: Step[] = (['check', 'closing', 'run'] as const).map((k) => ({ key: k, label: t(k), href: href[k], state: k === now ? 'now' : done.includes(k) ? 'done' : 'todo', note: notes[k] }));
  return <Steps label={t('label')} steps={steps} />;
}

/** 그 달 정규 급여대장으로 가는 주소 — 근태 마감의 「급여대장으로」와 같은 곳 */
export const runHref = (runId: string | null, live: boolean) => (runId ? `/admin/payroll/runs/${runId}` : `/admin/payroll/runs${live ? '?live=1' : ''}`);
