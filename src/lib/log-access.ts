// 접속 · 변경 기록을 볼 수 있는 사람 (2026-10-30 의뢰인: 「로그 기록은 최고관리자 이상준 계정과 시스템관리자만」). 서버 전용.
//   시스템관리자 + 회사 정보의 logViewers(직원 id 목록). logViewers를 정한 적이 없으면 관리자 폰 알림 「항상 받는 관리자」와 같은 사람(기본 이상준)
import 'server-only';
import { OFFICE } from '@/config/office';
import type { Me } from '@/lib/auth';
import { companyProfile } from '@/lib/company';
import { isSystemAdminNo } from '@/lib/system-admin';

export async function canViewLogs(me: Me): Promise<boolean> {
  if (me.role !== 'admin') return false;
  if (isSystemAdminNo(me.employeeNo)) return true;
  const p = await companyProfile();
  if (p.logViewers) return p.logViewers.includes(me.id);
  if (p.pushAlways !== undefined) return p.pushAlways === me.id;
  return me.employeeNo === OFFICE.pushAlwaysEmployeeNo;
}
