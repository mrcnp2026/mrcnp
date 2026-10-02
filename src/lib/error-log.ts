// 오류 기록 (② 7-16) — 서버 API 공통 처리(src/lib/api.ts)가 부른다. 화면은 ②-5(서비스 상태).
// ★ detail에는 "넣어도 되는 칸" 목록만 (B-40): 오류 종류 이름·HTTP 상태·DB 오류 코드·걸린 시간·앱 버전.
//   요청 본문·헤더(IP)·환경변수·이름·사번·외부 서비스 원문은 넣지 않는다. 빼야 할 것 목록이 아니라 넣을 것 목록이다.
// ★ 같은 오류는 한 줄로 묶는다 (B-41): 코드 + 경로 + 1시간 단위. DB 함수 log_app_error가 한 번에 처리한다.
import 'server-only';
import { ERROR_CATALOG, type ErrorCode } from '@/config/error-catalog';
import { OFFICE } from '@/config/office';
import { createAdminClient } from '@/lib/supabase/admin';

export type SafeDetail = {
  errorName?: string; // Error, TypeError 등 — 메시지 원문이 아니라 종류 이름만
  httpStatus?: number;
  dbCode?: string; // PostgREST/Postgres 오류 코드 (예: 23505)
  ms?: number;
  requestId?: string;
};

/** 허용 칸만 골라 담는다 — 모르는 칸이 들어와도 버린다 */
export function safeDetail(d: SafeDetail): Record<string, string | number> {
  const out: Record<string, string | number> = { appVersion: OFFICE.calcVersion };
  if (d.errorName && /^[A-Za-z]{1,40}$/.test(d.errorName)) out.errorName = d.errorName;
  if (typeof d.httpStatus === 'number') out.httpStatus = d.httpStatus;
  if (d.dbCode && /^[A-Z0-9]{2,10}$/.test(d.dbCode)) out.dbCode = d.dbCode;
  if (typeof d.ms === 'number') out.ms = Math.round(d.ms);
  if (d.requestId && /^[0-9a-f-]{36}$/.test(d.requestId)) out.requestId = d.requestId;
  return out;
}

/** 같은 오류 묶음 키: 코드 + 경로 + 1시간 단위 시각 (UTC 시) */
export function dedupKey(code: string, route: string, at: Date): string {
  return `${code}|${route}|${at.toISOString().slice(0, 13)}`;
}

export async function logError(e: { code: ErrorCode; route: string; employeeId?: string | null; detail?: SafeDetail }): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('log_app_error', {
      p_code: e.code,
      p_severity: ERROR_CATALOG[e.code].severity,
      p_route: e.route,
      p_dedup: dedupKey(e.code, e.route, new Date()),
      p_employee: e.employeeId ?? null,
      p_detail: safeDetail(e.detail ?? {}),
    });
    if (error) throw new Error(error.code);
  } catch (err) {
    // ★ B-42: 오류를 적다가 난 오류가 원래 요청(출근 등)을 막으면 안 된다 — 여기서만 삼키고 서버 로그에만 남긴다.
    console.error(JSON.stringify({ route: 'error-log', code: 'ERROR_LOG_FAILED', reason: String((err as Error)?.message ?? err).slice(0, 40) }));
  }
}
