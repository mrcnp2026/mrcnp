// 지금 회사 로고 (2026-10-18) — 로그인 화면에도 나오므로 로그인 없이 연다. 올린 로고가 없으면 원래 로고 파일로 보낸다.
// 화면은 이 주소를 쓴다(components/Logo). 바뀐 로고는 길어야 5분 뒤 모든 화면에 보인다.
import { BRAND } from '@/config/brand';
import { COLORS } from '@/config/theme';
import { companyName, companyProfile } from '@/lib/company';
import { switchOn } from '@/lib/switches';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request): Promise<Response> {
  const p = await companyProfile();
  const fallback = () => Response.redirect(new URL(BRAND.logo.src, req.url), 302);
  // 통합설정 › 고급 옵션의 「회사 로고」를 끄면 로고 대신 회사 이름 글자 그림을 보낸다 (2026-10-19) — 화면 쪽은 그대로 이 주소를 쓴다
  if (!(await switchOn('advanced.brand'))) {
    const name = (await companyName()).replace(/[<>&"']/g, '');
    const w = Math.max(80, Math.round([...name].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 30 : 17), 0)));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40" viewBox="0 0 ${w} 40"><text x="0" y="29" font-family="Pretendard, 'Noto Sans KR', 'Malgun Gothic', sans-serif" font-size="28" font-weight="700" fill="${COLORS.primary}">${name}</text></svg>`;
    return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  }
  if (!p.logoPath || !p.logoMime) return fallback();
  const { data, error } = await createAdminClient().storage.from('content').download(p.logoPath);
  if (error || !data) return fallback();
  return new Response(data.stream(), {
    headers: { 'content-type': p.logoMime, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" },
  });
}
