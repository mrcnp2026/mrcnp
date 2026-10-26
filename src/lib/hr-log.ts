// 인사 기록 (2026-10-25 의뢰인) — 직원 상세 「인사 기록」(옛 비고) 글 · 퇴사 · 복직 · 권한 변경 · 입사일 수정 · 엑셀 내려받기를 한 목록으로 모은다.
// 관리자 「인사 기록」 화면과 엑셀이 같은 줄을 쓴다. 서버 전용. 새 표는 만들지 않고 이미 쌓이는 기록을 읽는다:
//   비고 표(staff_notes) · 변경 기록(audit_logs: 퇴사 · 복직 · 권한 event, 그리고 profiles 수정 줄의 앞뒤 값) · 내려받기 기록(download_logs)
// 겹치는 줄은 한 번만 나오게 한다: 퇴사 · 복직 때 비고에 자동으로 남는 줄(statusNote)은 뺀다. 권한은 event 줄이 있으면 같은 때의 수정 줄을 뺀다.
// 퇴사 처리 기록이 없는데 이미 꺼져 있는 사람(옮겨 온 퇴사자)은 구분만 「퇴사」로, 날짜 · 내용은 비워서 보인다.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { NOT_SYSTEM_ADMIN } from '@/lib/system-admin';
import { toKstDate } from '@/lib/time';

export type HrKind = 'resign' | 'reinstate' | 'note' | 'role' | 'joined' | 'download';
export type HrLogRow = {
  key: string;
  noteId: string | null; // 기록 글이면 그 글의 id(선택 삭제용), 아니면 null
  employeeId: string;
  name: string;
  employeeNo: string | null;
  groupId: string | null;
  joinedOn: string | null;
  kind: HrKind;
  on: string | null; // 처리한 날(KST)
  reason: string | null; // 내용 (퇴사 · 복직은 사유)
  actor: string | null;
  active: boolean; // 지금 재직 중인가
};
export type HrPerson = { id: string; name: string; employee_no: string | null; group_id: string | null; joined_on: string | null; active: boolean };
export type HrEvent = { id: number; actor_id: string | null; target_id: string | null; reason: string | null; created_at: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export type HrNote = { id: string; employee_id: string; body: string; created_at: string; created_by: string };
export type HrDownload = { id: number; actor_id: string; kind: string; file_name: string; purpose: string | null; created_at: string };

/** 퇴사 · 복직 처리 때 비고에 자동으로 남는 줄 (lib/staff-rules statusNote) */
const AUTO_NOTE = /^\[(퇴사|복직) 처리\]/;
const ROLE: Record<string, string> = { admin: '관리자', manager: '지점관리자', employee: '직원' };
const LEVEL: Record<string, string> = { super: '최고관리자', ceo: '대표자' };
const SAME_TIME_MS = 120_000;

const roleText = (role: unknown, level: unknown) => [ROLE[String(role)] ?? String(role ?? '-'), level ? (LEVEL[String(level)] ?? String(level)) : null].filter(Boolean).join(' ');
const gradeText = (v: unknown) => {
  const o = (v ?? {}) as { grade?: string; level?: string };
  return o.level ? (LEVEL[o.level] ?? o.level) : o.grade ? (ROLE[o.grade] ?? o.grade) : '-';
};

/** 줄 만들기 — 순수 함수로 떼어 두었다 (시험용) */
export function buildHrLogRows(people: HrPerson[], events: HrEvent[], notes: HrNote[] = [], downloads: HrDownload[] = []): HrLogRow[] {
  const who = new Map(people.map((p) => [p.id, p]));
  const rows: HrLogRow[] = [];
  const hasResign = new Set<string>();
  const roleEventAt = new Map<string, number[]>(); // 권한 event 줄의 시각 — 같은 때의 수정 줄을 빼는 데 쓴다
  const add = (p: HrPerson, key: string, kind: HrKind, at: string, reason: string | null, actorId: string | null) =>
    rows.push({ key, noteId: key.startsWith('n') ? key.slice(1) : null, employeeId: p.id, name: p.name, employeeNo: p.employee_no, groupId: p.group_id, joinedOn: p.joined_on, kind, on: toKstDate(new Date(at)), reason, actor: actorId ? (who.get(actorId)?.name ?? null) : null, active: p.active });
  const evName = (e: HrEvent) => String((e.after as { event?: string } | null)?.event ?? '');

  for (const e of events) {
    const p = e.target_id ? who.get(e.target_id) : undefined;
    if (!p) continue;
    const ev = evName(e);
    if (ev === 'resign' || ev === 'reinstate') {
      if (ev === 'resign') hasResign.add(p.id);
      add(p, `e${e.id}`, ev, e.created_at, e.reason, e.actor_id);
    } else if (ev === 'role_changed') {
      const d = e.after as { from?: unknown; to?: unknown };
      roleEventAt.set(p.id, [...(roleEventAt.get(p.id) ?? []), Date.parse(e.created_at)]);
      add(p, `e${e.id}`, 'role', e.created_at, `${gradeText(d.from)} → ${gradeText(d.to)}${e.reason ? ` (사유: ${e.reason})` : ''}`, e.actor_id);
    }
  }
  // profiles 수정 줄(트리거)에서 앞뒤 값이 달라진 것 — 권한 · 입사일
  for (const e of events) {
    const p = e.target_id ? who.get(e.target_id) : undefined;
    if (!p || e.action !== 'update' || !e.before || !e.after || evName(e)) continue;
    if (e.before.role !== e.after.role || e.before.admin_level !== e.after.admin_level) {
      const t = Date.parse(e.created_at);
      if (!(roleEventAt.get(p.id) ?? []).some((x) => Math.abs(x - t) <= SAME_TIME_MS)) add(p, `r${e.id}`, 'role', e.created_at, `${roleText(e.before.role, e.before.admin_level)} → ${roleText(e.after.role, e.after.admin_level)}`, e.actor_id);
    }
    if (e.before.joined_on !== e.after.joined_on) add(p, `j${e.id}`, 'joined', e.created_at, `입사일 ${e.before.joined_on ?? '없음'} → ${e.after.joined_on ?? '없음'}`, e.actor_id);
  }
  for (const n of notes) {
    const p = who.get(n.employee_id);
    if (p && !AUTO_NOTE.test(n.body)) add(p, `n${n.id}`, 'note', n.created_at, n.body, n.created_by);
  }
  for (const d of downloads) {
    const p = who.get(d.actor_id); // 내려받은 사람이 「이름」 칸에 온다
    if (p) add(p, `d${d.id}`, 'download', d.created_at, `${d.file_name}${d.purpose ? ` (사유: ${d.purpose})` : ''}`, d.actor_id);
  }
  for (const p of people) if (!p.active && !hasResign.has(p.id)) rows.push({ key: `p${p.id}`, noteId: null, employeeId: p.id, name: p.name, employeeNo: p.employee_no, groupId: p.group_id, joinedOn: p.joined_on, kind: 'resign', on: null, reason: null, actor: null, active: false });
  return rows.sort((a, b) => (b.on ?? '').localeCompare(a.on ?? '') || a.name.localeCompare(b.name, 'ko'));
}

/** 변경 기록 조회 창 — 오래된 수정 줄까지 끝없이 읽지 않는다 */
const DIFF_WINDOW_DAYS = 400;

export async function loadHrLog(): Promise<HrLogRow[]> {
  const db = createAdminClient();
  const since = new Date(Date.now() - DIFF_WINDOW_DAYS * 864e5).toISOString();
  const [{ data: people }, { data: ev }, { data: df }, { data: nt }, { data: dl }] = await Promise.all([
    db.from('profiles').select('id, name, employee_no, group_id, joined_on, active').or(NOT_SYSTEM_ADMIN).limit(5000),
    // 처리 기록(퇴사 · 복직 · 권한 event) — 줄 수가 적다. 앞뒤 값 전체가 필요하다
    db.from('audit_logs').select('id, actor_id, target_id, reason, created_at, action, after_data').eq('target_table', 'profiles').not('after_data->>event', 'is', null).order('created_at', { ascending: false }).limit(1000),
    // 직원 정보 수정 줄 — 권한 · 입사일이 달라졌는지만 보면 되므로 그 칸만 가져온다(전체 JSON은 줄마다 1KB 가까이 된다)
    db.from('audit_logs').select('id, actor_id, target_id, created_at, b_role:before_data->>role, a_role:after_data->>role, b_level:before_data->>admin_level, a_level:after_data->>admin_level, b_joined:before_data->>joined_on, a_joined:after_data->>joined_on').eq('target_table', 'profiles').eq('action', 'update').is('after_data->>event', null).gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    db.from('staff_notes').select('id, employee_id, body, created_at, created_by').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000), // 표가 없으면 error → 빈 목록
    db.from('download_logs').select('id, actor_id, kind, file_name, purpose, created_at').order('created_at', { ascending: false }).limit(1000),
  ]);
  const staff = (people ?? []).filter((p) => !p.employee_no?.startsWith('e2e-'));
  const events: HrEvent[] = [
    ...(ev ?? []).map((e) => ({ id: e.id as number, actor_id: e.actor_id as string | null, target_id: e.target_id as string | null, reason: e.reason as string | null, created_at: e.created_at as string, action: e.action as string, before: null, after: e.after_data as HrEvent['after'] })),
    ...((df ?? []) as unknown as Record<string, string | number | null>[]).map((e) => ({
      id: e.id as number, actor_id: e.actor_id as string | null, target_id: e.target_id as string | null, reason: null, created_at: e.created_at as string, action: 'update',
      before: { role: e.b_role, admin_level: e.b_level, joined_on: e.b_joined }, after: { role: e.a_role, admin_level: e.a_level, joined_on: e.a_joined },
    })),
  ];
  return buildHrLogRows(staff, events, (nt ?? []) as HrNote[], (dl ?? []) as HrDownload[]);
}
