// 「지금 업데이트」 — 공식기관 원문을 지금 다시 받아 읽는다 (PRD v1.3 6.1 · 17.4 · 31장). 급여 담당 관리자만.
// 결과는 「검토 대기」 후보로만 들어간다. 지금 쓰는 값은 바뀌지 않는다. 앞선 실행이 끝나지 않았으면 409.
import { api } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { runCollector } from '@/lib/payroll/collector/run';
import { SOURCES } from '@/lib/payroll/collector/sources';
import { requirePayroll } from '@/lib/payroll/data';

export const maxDuration = 60;

/** 탭별 출처 — 간이세액표 탭은 세액표 · 개정문만, 사회보험 요율표 탭은 나머지 */
const TAX = ['tax', 'tax_amendment'];

export const POST = api('admin.payroll.reference.refresh', async (req) => {
  await requireConsole(); // 통합설정 잠금 — 숫자 4자리로 연 관리자만 (2026-10-14 결정 사항 개발-29)
  const me = await requirePayroll();
  const { section } = (await req.json().catch(() => ({}))) as { section?: string };
  const only = section === 'income-tax' ? TAX : section === 'insurance-rates' ? SOURCES.map((x) => x.id).filter((id) => !TAX.includes(id)) : undefined;
  return await runCollector(me, 'manual', only);
});
