// 급여대장 「한꺼번에 넣기」의 대상 직원 · 넣을 수 있는 항목 (2026-10-20). 서버 전용 — 부르는 쪽이 급여 담당자인지 먼저 확인한다.
import 'server-only';
import { ApiError } from '@/lib/api';
import { bulkColumns, type BulkMember } from '@/lib/payroll/bulk-adjust';
import { loadItems } from '@/lib/payroll/data';
import { loadRun } from '@/lib/payroll/run-data';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bulkContext(id: string) {
  if (!UUID.test(id)) throw new ApiError(400, 'invalid_input');
  const run = await loadRun(id);
  if (!run) throw new ApiError(404, 'not_found');
  const last = new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const c = createAdminClient();
  const { data: mem } = await c.from('payroll_run_members').select('employee_id').eq('run_id', run.id).eq('inclusion_state', 'INCLUDED');
  const ids = (mem ?? []).map((m) => m.employee_id as string);
  const { data: ppl } = ids.length ? await c.from('profiles').select('id, name, employee_no').in('id', ids) : { data: [] };
  const members: BulkMember[] = (ppl ?? []).map((p) => ({ employeeId: p.id as string, employeeNo: (p.employee_no as string | null) ?? null, name: p.name as string })).sort((a, b) => (a.employeeNo ?? '').localeCompare(b.employeeNo ?? '') || a.name.localeCompare(b.name, 'ko'));
  const columns = bulkColumns(await loadItems(undefined, last));
  return { run, members, columns };
}

