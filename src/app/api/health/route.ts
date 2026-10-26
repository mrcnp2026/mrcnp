// 가동 확인 (외부 업타임 모니터가 5분마다 부른다) — 사이트와 DB가 둘 다 살아 있으면 200, 아니면 503.
// 로그인 없이 열리므로 이름·사번·건수 같은 자료는 절대 돌려주지 않는다. 정상 여부와 걸린 시간만.
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(): Promise<Response> {
  const t = performance.now();
  try {
    const { error } = await createAdminClient().from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw error;
    return Response.json({ ok: true, ms: Math.round(performance.now() - t) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
