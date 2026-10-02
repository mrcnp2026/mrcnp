// 서버 API 공통 — 모든 응답에 요청 번호(x-request-id)를 붙이고, 오류는 코드만 돌려준다 (부록 R-12-4).
// 화면은 코드를 번역 파일(errors.<code>)로 바꿔 직원 언어로 보여 주고, 맨 아래 "문의번호"(앞 8자)를 표시한다.
// 서버 로그에는 요청 번호·경로·오류 코드·걸린 시간만 남긴다 — 이름·IP·노트·금액 금지 (R-5의 7).
import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { PasskeyError } from '@/lib/passkey';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

type Handler<C> = (req: NextRequest, ctx: C & { requestId: string }) => Promise<unknown>;

export function api<C extends { params: Promise<object> } = { params: Promise<Record<string, string>> }>(
  route: string,
  handler: Handler<C>,
) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    let status = 200;
    let body: unknown;
    try {
      body = (await handler(req, { ...ctx, requestId })) ?? { ok: true };
    } catch (e) {
      if (e instanceof ApiError) {
        status = e.status;
        body = { error: e.code };
      } else if (e instanceof PasskeyError) {
        status = 400;
        body = { error: e.code };
      } else {
        status = 500;
        body = { error: 'generic' };
        // 원인 메시지는 서버 로그에만 (화면에 스택·SQL·키를 보이지 않는다, ②-1 요점 3)
        console.error(JSON.stringify({ requestId, route, code: 'unhandled', detail: String((e as Error)?.message ?? e).slice(0, 300) }));
      }
    }
    if (status >= 400) {
      console.error(JSON.stringify({ requestId, route, code: (body as { error: string }).error, ms: Date.now() - started }));
      body = { ...(body as object), requestId };
    }
    const res = NextResponse.json(body, { status });
    res.headers.set('x-request-id', requestId);
    return res;
  };
}

/** 요청 본문을 JSON으로. 깨졌으면 invalid_input */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {}
  throw new ApiError(400, 'invalid_input');
}
