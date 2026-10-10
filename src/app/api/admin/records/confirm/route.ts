// 기록 확정 · 확정 풀기 (의뢰인 2026-10-11 확정). 한 번에 여러 건(그날 전부)을 받을 수 있다.
// 확정할 수 있는 날: 오늘까지 · 기록이 있는 날 · 퇴근이 빠지지 않은 날 · 대기 중인 정정 요청이 없는 날 · 자기 기록이 아닌 것(다른 관리자가 있을 때).
// 안 되는 건은 건너뛰고 이유를 돌려준다 — 한 건 때문에 나머지가 막히지 않게.
// 풀기: 켜진 줄을 끈다(active=false, 누가·언제). 줄은 지우지 않는다.
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { loadConfirms, confirmKey } from '@/lib/confirm-data';
import { daysFor, loadPeriod } from '@/lib/period-data';
import { isPeriodLocked } from '@/lib/punch';
import { loadStaff } from '@/lib/staff-data';
import { selfDecisionBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

const MAX = 200;
type Item = { employeeId: string; date: string };

export const POST = api('admin.records.confirm', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (typeof b.confirm !== 'boolean' || !Array.isArray(b.items) || b.items.length === 0 || b.items.length > MAX) throw new ApiError(400, 'invalid_input');
  const items: Item[] = [];
  for (const x of b.items as unknown[]) {
    const it = x as { employeeId?: unknown; date?: unknown };
    if (typeof it?.employeeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(it.employeeId) || typeof it.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(it.date)) throw new ApiError(400, 'invalid_input');
    if (!items.some((y) => y.employeeId === it.employeeId && y.date === it.date)) items.push({ employeeId: it.employeeId, date: it.date });
  }
  const practice = OFFICE.practiceMode;
  const today = toKstDate(new Date());
  const from = items.reduce((a, x) => (x.date < a ? x.date : a), items[0].date);
  const to = items.reduce((a, x) => (x.date > a ? x.date : a), items[0].date);
  if (to > today) throw new ApiError(400, 'invalid_input');
  const db = createAdminClient();
  const confirms = await loadConfirms(from, to, practice);
  const skipped: { employeeId: string; date: string; code: string }[] = [];
  let done = 0;

  if (!b.confirm) {
    for (const it of items) {
      const c = confirms.get(confirmKey(it.employeeId, it.date));
      if (!c) continue;
      if (await isPeriodLocked(it.employeeId, it.date)) {
        skipped.push({ ...it, code: 'period_locked' });
        continue;
      }
      const { data, error } = await db.from('day_confirms').update({ active: false, released_by: me.id, released_at: new Date().toISOString() }).eq('id', c.id).eq('active', true).select('id');
      if (error) throw new Error(`records.release: ${error.code}`);
      done += data?.length ?? 0;
    }
    return { done, skipped };
  }

  const [data, staff] = await Promise.all([loadPeriod(from, to, practice), loadStaff()]);
  if (!data.rule) throw new ApiError(409, 'no_rule');
  for (const it of items) {
    if (confirms.has(confirmKey(it.employeeId, it.date))) continue; // 이미 확정됨
    const skip = (code: string) => skipped.push({ ...it, code });
    if (!data.people.some((p) => p.id === it.employeeId)) {
      skip('not_found');
      continue;
    }
    if (selfDecisionBlocked(me.id, it.employeeId, staff)) {
      skip('self_decision');
      continue;
    }
    const day = daysFor(data, it.employeeId, it.date, it.date)[0];
    if (!day || day.pairs.length === 0) {
      skip('no_record');
      continue;
    }
    if (day.pairs.some((p) => !p.in || !p.out)) {
      skip('not_closed'); // 출근이나 퇴근이 빠진 기록 — 정정으로 채운 뒤 확정한다
      continue;
    }
    if (data.corrections.some((c) => c.employeeId === it.employeeId && c.workDate === it.date && c.status === 'pending')) {
      skip('pending_exists');
      continue;
    }
    const { error } = await db.from('day_confirms').insert({ employee_id: it.employeeId, work_date: it.date, is_test: practice, confirmed_by: me.id });
    if (error && error.code !== '23505') throw new Error(`records.confirm: ${error.code}`); // 23505 = 방금 다른 사람이 확정함
    if (!error) done++;
  }
  // 한 건만 보냈는데 안 됐으면 이유를 바로 알린다
  if (items.length === 1 && done === 0 && skipped.length === 1) throw new ApiError(409, skipped[0].code);
  return { done, skipped };
});
