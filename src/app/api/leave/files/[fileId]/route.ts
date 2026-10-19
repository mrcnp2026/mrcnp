// 휴가 증빙 파일 보기 — 본인 · 관리자 · 맡은 지점관리자만. 비공개 저장소에서 꺼내 그대로 보낸다(주소를 밖에 공개하지 않는다).
import { getMe } from '@/lib/auth';
import { openLeaveFile } from '@/lib/leave-evidence';

export async function GET(_req: Request, ctx: { params: Promise<{ fileId: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me) return new Response(null, { status: 401 });
  const { fileId } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) return new Response(null, { status: 404 });
  const f = await openLeaveFile({ me, fileId });
  if (!f) return new Response(null, { status: 404 }); // 없거나 볼 수 없으면 똑같이 「없음」
  return new Response(f.body.stream(), {
    headers: {
      'content-type': f.mime,
      // 브라우저 안에서 연다(PDF · 사진). 이름은 올린 이름 그대로
      'content-disposition': `inline; filename="evidence"; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'self'",
      'x-robots-tag': 'noindex',
    },
  });
}
