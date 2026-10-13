// 재직 기간 · 소속 이력을 지금의 직원 정보에 맞춘다 (PRD v1.3 38.1: 현재 active/group_id만으로 과거를 다시 계산하지 않게).
// 직원 정보를 바꾸는 길(추가 · 정보 고치기 · 입사일 · 퇴사/복직 · 직무 지정)이 끝에서 이 함수를 부른다.
// 이력은 지우지 않는다: 바뀌면 앞 줄을 오늘로 닫고 새 줄을 넣는다. 같은 날 다시 고친 것은 그날 줄을 끄고 새로 넣는다(오타 수정).
// 모르는 것은 만들지 않는다 — 입사일이 없으면 재직 기간을 넣지 않고, 소속 이력은 "오늘부터"로만 시작한다.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export async function syncStaffHistory(employeeId: string, actorId: string | null): Promise<void> {
  const db = createAdminClient();
  const today = toKstDate(new Date());
  const { data: p } = await db.from('profiles').select('id, active, joined_on, group_id, job_id, job_title').eq('id', employeeId).maybeSingle();
  if (!p) return;

  // ── 재직 기간 ──
  const { data: periods } = await db.from('staff_employment_periods').select('id, starts_on, ends_on').eq('employee_id', employeeId).eq('active', true).order('starts_on', { ascending: false }).limit(1);
  const last = periods?.[0] ?? null;
  const open = last && last.ends_on === null ? last : null;
  if (p.active) {
    if (open) {
      // 입사일을 고쳤다 — 앞 줄을 끄고 새 시작일로 다시 넣는다
      if (p.joined_on && open.starts_on !== p.joined_on) {
        await db.from('staff_employment_periods').update({ active: false, updated_by: actorId }).eq('id', open.id);
        await db.from('staff_employment_periods').insert({ employee_id: employeeId, starts_on: p.joined_on, created_by: actorId });
      }
    } else if (last) {
      // 퇴사 처리했다가 다시 켰다(복직) — 끝난 기간 뒤로 새 기간. 시작일은 새 입사일이 그 뒤면 그것, 아니면 오늘
      const start = p.joined_on && p.joined_on > last.ends_on ? p.joined_on : today > last.ends_on ? today : null;
      if (start) await db.from('staff_employment_periods').insert({ employee_id: employeeId, starts_on: start, created_by: actorId });
    } else if (p.joined_on) {
      await db.from('staff_employment_periods').insert({ employee_id: employeeId, starts_on: p.joined_on, created_by: actorId });
    }
  } else if (open) {
    // 퇴사 처리 — 오늘을 마지막 근무일로 닫는다(실제 마지막 근무일이 다르면 직원 화면에서 고친다)
    await db.from('staff_employment_periods').update({ ends_on: today < open.starts_on ? open.starts_on : today, updated_by: actorId }).eq('id', open.id);
  }

  // ── 소속 · 직무 이력 ──
  const { data: cur } = await db.from('staff_assignment_history').select('id, group_id, job_id, job_title, valid_from').eq('employee_id', employeeId).eq('active', true).is('valid_to', null).limit(1);
  const a = cur?.[0] ?? null;
  const want = { group_id: p.group_id as string | null, job_id: p.job_id as string | null, job_title: p.job_title as string | null };
  if (a && a.group_id === want.group_id && a.job_id === want.job_id && a.job_title === want.job_title) return;
  let from = today;
  if (a) {
    if (a.valid_from >= today) {
      await db.from('staff_assignment_history').update({ active: false, updated_by: actorId }).eq('id', a.id);
      from = a.valid_from;
    } else {
      await db.from('staff_assignment_history').update({ valid_to: today, updated_by: actorId }).eq('id', a.id);
    }
  }
  await db.from('staff_assignment_history').insert({ employee_id: employeeId, ...want, valid_from: from, created_by: actorId });
}

/** 이력 맞추기가 실패해도 직원 정보를 바꾼 일 자체는 끝난 것이다 — 실패는 서버 기록에만 남긴다 */
export async function syncStaffHistorySafe(employeeId: string, actorId: string | null): Promise<void> {
  try {
    await syncStaffHistory(employeeId, actorId);
  } catch (e) {
    console.error(JSON.stringify({ route: 'staff-history', code: 'sync_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }));
  }
}
