// 시스템관리자(사번 admin, 등급 system — DB 묶음 23) — 권한은 최고관리자와 같지만 직원이 아니다 (2026-10-18 의뢰인).
// 직원 목록 · 조직도 · 근무일정 · 출퇴근 · 리포트 · 마감 · 급여 · 공지 받는 사람 등 화면 어디에도 보이지 않는다.
// 예외: 통합설정 › 권한 표에 「시스템관리자」 한 줄(있다는 것을 최고관리자가 알 수 있게), 본인이 볼 때의 내 화면.
// 출퇴근 · 요청 · 리포트 계산은 period-data의 hiddenTestIds가 한 곳에서 뺀다. 여기는 직원을 직접 읽는 목록용.
import { OFFICE } from '@/config/office';

export const SYSTEM_ADMIN_NO = OFFICE.ownerEmployeeNo;
export const isSystemAdminNo = (no: string | null | undefined): boolean => no === SYSTEM_ADMIN_NO;
/** 직원 줄 목록에서 시스템관리자를 뺀다 (employee_no 또는 employeeNo 칸) */
export function withoutSystemAdmin<T extends { employee_no?: unknown; employeeNo?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => !isSystemAdminNo((r.employee_no ?? r.employeeNo) as string | null | undefined));
}
/** profiles를 읽는 질의에 붙이는 거름 — `.or(NOT_SYSTEM_ADMIN)` (사번이 비어 있는 줄은 남긴다) */
export const NOT_SYSTEM_ADMIN = `employee_no.is.null,employee_no.neq.${SYSTEM_ADMIN_NO}`;
