// 지금 앱 아이콘 (2026-11-03) — 탭 · 홈 화면 아이콘이 쓴다(layout 메타 · manifest). 로그인 없이 연다. 올린 것이 없으면 원래 파일로.
//   ?s=s64 | s180 | s192 | s512 | mask512
import { companyProfile } from '@/lib/company';
import { ICON_SIZES, type IconSize } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';

const FALLBACK: Record<IconSize, string> = { s64: '/brand/favicon-64.png', s180: '/brand/apple-icon.png', s192: '/brand/icon-192.png', s512: '/brand/icon-512.png', mask512: '/brand/icon-maskable-512.png' };

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('s') ?? 's192';
  const size: IconSize = q in ICON_SIZES ? (q as IconSize) : 's192';
  const p = await companyProfile();
  const fallback = () => new Response(null, { status: 302, headers: { location: new URL(FALLBACK[size], req.url).href, 'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400' } }); // 넘겨 주기도 CDN 캐시 (2026-11-04)
  if (!p.iconPath) return fallback();
  const { data, error } = await createAdminClient().storage.from('content').download(`${p.iconPath}/${size}.png`);
  if (error || !data) return fallback();
  return new Response(data.stream(), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
}
