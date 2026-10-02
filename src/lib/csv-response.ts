// CSV 내려받기 응답 — 요청 번호를 붙이고(R-12-4), 캐시하지 않는다 (직원 개인정보).
import 'server-only';
import { randomUUID } from 'node:crypto';

export function csvResponse(body: string, fileName: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

export function deny(status: number, code: string): Response {
  const requestId = randomUUID();
  console.error(JSON.stringify({ requestId, route: 'export', code }));
  return Response.json({ error: code, requestId }, { status, headers: { 'x-request-id': requestId } });
}
