// 오류 코드 목록 (② 7-16) — 한 곳에. 관리자 화면(서비스 상태, ②-5)의 설명·조치 바로가기가 이 표에서 나온다.
// ★ 바로가기는 이미 있는 화면만 가리킨다 (② 4-12) — 오류 화면에서 기록을 직접 고치는 버튼을 만들지 않는다.
//   바로가기 경로가 실제로 있는지는 게이트 14에서 npm run verify가 검사한다 (지금은 대상 화면이 아직 없는 것도 있다).

export const ERROR_CATALOG = {
  PUNCH_SAVE_FAILED: { severity: 'error', fixes: ['/admin/inbox#proxy', '/admin/inbox#bulk'], developer: 'repeat' },
  PASSKEY_VERIFY_FAILED: { severity: 'warn', fixes: ['/admin/members', '/admin/inbox#proxy'], developer: 'no' },
  AUTH_SESSION_FAILED: { severity: 'error', fixes: ['/admin/inbox#proxy'], developer: 'yes' },
  EXPORT_FAILED: { severity: 'error', fixes: ['/admin/records#downloads'], developer: 'repeat' },
  TRANSLATION_FAILED: { severity: 'warn', fixes: ['/admin/notices'], developer: 'no' },
  IMAGE_PROCESS_FAILED: { severity: 'warn', fixes: ['/admin/notices'], developer: 'repeat' },
  DB_UNREACHABLE: { severity: 'error', fixes: [], developer: 'if_persists' },
  UNKNOWN: { severity: 'error', fixes: ['/admin/status#diag'], developer: 'yes' },
} as const satisfies Record<string, { severity: 'info' | 'warn' | 'error'; fixes: readonly string[]; developer: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** API 경로 → 오류 코드. 목록에 없는 경로의 예상 못 한 실패는 UNKNOWN */
export function codeForRoute(route: string): ErrorCode {
  if (route === 'punch' || route.startsWith('punch.')) return 'PUNCH_SAVE_FAILED';
  if (route.startsWith('passkey.')) return 'PASSKEY_VERIFY_FAILED';
  if (route.startsWith('auth.') || route.startsWith('login')) return 'AUTH_SESSION_FAILED';
  if (route.startsWith('admin.export')) return 'EXPORT_FAILED';
  if (route.startsWith('admin.notices.translate')) return 'TRANSLATION_FAILED';
  return 'UNKNOWN';
}
