// 통합설정(특별관리자 모드) 화면의 주소 — 숫자 4자리 잠금이 걸리는 곳 (2026-10-14 결정 사항 개발-29, DB 묶음 7).
// 화면 틀 · 미들웨어 · 검사가 함께 쓴다(아이콘이 없는 가벼운 파일이라 미들웨어에서도 읽는다).
// ★ config/nav.ts의 통합설정 항목과 같아야 한다 — tests/nav.test.ts가 맞는지 본다.
const PREFIXES = ['/admin/console', '/admin/settings', '/admin/branches', '/admin/places', '/admin/jobs', '/admin/shifts', '/admin/leave/types', '/admin/diag', '/admin/manage'];
const NOT_CONSOLE = ['/admin/manage/report-snapshots']; // 저장한 리포트는 관리자 모드의 리포트

export function isConsolePath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (NOT_CONSOLE.some((x) => p === x || p.startsWith(`${x}/`))) return false;
  return PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}

export const CONSOLE_COOKIE = 'console_unlock';
export const CONSOLE_MINUTES = 30; // 한 번 열면 30분
