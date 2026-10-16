// 글에 넣은 사진 보기 — 로그인한 사람만. 비공개 저장소에서 꺼내 그대로 보낸다(주소를 밖에 공개하지 않는다).
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404 });
  const db = createAdminClient();
  const { data: row } = await db.from('content_images').select('storage_path, mime').eq('id', id).maybeSingle();
  if (!row) return new Response(null, { status: 404 });
  const { data, error } = await db.storage.from('content').download(row.storage_path as string);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data.stream(), {
    headers: {
      'content-type': row.mime as string,
      // 사진은 바뀌지 않는다(새로 올리면 새 id) — 로그인한 브라우저 안에서만 오래 둔다
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
