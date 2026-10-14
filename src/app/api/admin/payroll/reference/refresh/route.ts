// 「지금 업데이트」 — 공식기관 원문을 지금 다시 받아 읽는다 (PRD v1.3 6.1 · 17.4 · 31장). 급여 담당 관리자만.
// 결과는 「검토 대기」 후보로만 들어간다. 지금 쓰는 값은 바뀌지 않는다. 앞선 실행이 끝나지 않았으면 409.
import { api } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { runCollector } from '@/lib/payroll/collector/run';
import { requirePayroll } from '@/lib/payroll/data';

export const maxDuration = 60;

export const POST = api('admin.payroll.reference.refresh', async () => {
  await requireConsole(); // 통합설정 잠금 — 숫자 4자리로 연 관리자만 (2026-10-14 결정 사항 개발-29)
  const me = await requirePayroll();
  return await runCollector(me, 'manual');
});
