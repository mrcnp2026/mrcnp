// 브라우저 → 서버 API 호출. 오류는 코드와 문의번호로만 돌려준다 (R-12-4). 화면이 번역해서 보여 준다.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; requestId?: string };

export async function callApi<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'network' };
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; requestId?: string };
  if (!res.ok) return { ok: false, code: json.error ?? 'generic', requestId: json.requestId ?? res.headers.get('x-request-id') ?? undefined };
  return { ok: true, data: json as T };
}

/** 브라우저의 패스키 오류 → 번역 키. 사용자가 취소하거나 시간이 지나면 NotAllowedError가 온다 */
export function passkeyBrowserError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'cancelled';
  if (name === 'InvalidStateError') return 'already_registered'; // 이 폰에 같은 계정 패스키가 이미 있음
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'unsupported';
  return 'verification_failed';
}
