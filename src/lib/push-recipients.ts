// 관리자 폰 알림을 누가 받는가 (2026-10-21 의뢰인, 결정 사항 알림-9). 서버 전용.
//   · 이상준 최고관리자(OFFICE.pushAlwaysEmployeeNo): 항상 받는다 — 끌 수 없다
//   · 대표자(admin_level ceo): 받지 않는다 — 켤 수 없다
//   · 나머지 최고관리자(시스템관리자 포함): 기본 끔. 통합설정 › 알림에서 사람마다 켠다 (회사 정보 이력의 pushAdmins 칸 — DB 변경 없음)
//   · 지점관리자 · 일반직원: 지금까지대로 (지점관리자는 맡은 지점 직원 알림, 직원은 본인 알림)
// 관리자에게 가는 알림(요청 · 미출근 · 미기록 묶음 · 지각/조퇴 · 처리 기한 · 체류 기간 · 가입 신청 · 매주 미처리)만 여기를 거친다.
// 본인에게 가는 알림(시험 보내기 · 내 요청 결과 · 교육 서명)은 거치지 않는다.
import 'server-only';
import { OFFICE } from '@/config/office';
import { companyProfile, putCompanyProfile } from '@/lib/company';
import { createAdminClient } from '@/lib/supabase/admin';

export type PushAdminRule = 'always' | 'never' | 'choice';
type AdminRow = { id: string; role: string; admin_level?: string | null; employee_no?: string | null };

/** 이 관리자의 규칙 — 지점관리자 · 직원은 null(이 규칙을 타지 않는다) */
export function pushAdminRule(p: AdminRow): PushAdminRule | null {
  if (p.role !== 'admin') return null;
  if (p.employee_no === OFFICE.pushAlwaysEmployeeNo) return 'always';
  if (p.admin_level === 'ceo') return 'never';
  return 'choice';
}

/** 받는가 — saved는 통합설정에서 켠 사람(id → true). 저장한 적 없으면 끔 */
export function receivesStaffPush(p: AdminRow, saved: Record<string, boolean>): boolean {
  const rule = pushAdminRule(p);
  if (rule === null || rule === 'always') return true;
  if (rule === 'never') return false;
  return saved[p.id] === true;
}

export async function savedPushAdmins(): Promise<Record<string, boolean>> {
  return (await companyProfile()).pushAdmins ?? {};
}

export async function putPushAdmin(id: string, on: boolean, actorId: string): Promise<void> {
  const saved = await savedPushAdmins();
  await putCompanyProfile({ pushAdmins: { ...saved, [id]: on } }, actorId);
}

/** 관리자에게 가는 알림의 받는 사람에서 꺼진 최고관리자를 뺀다 */
export async function staffPushFilter(ids: string[]): Promise<string[]> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return [];
  const [{ data, error }, saved] = await Promise.all([createAdminClient().from('profiles').select('id, role, admin_level, employee_no').in('id', uniq), savedPushAdmins()]);
  if (error) throw new Error(`staffPushFilter: ${error.code}`);
  const rows = new Map((data ?? []).map((p) => [p.id as string, p as AdminRow]));
  return uniq.filter((id) => {
    const p = rows.get(id);
    return p ? receivesStaffPush(p, saved) : false;
  });
}
