// 주소 → 좌표 (2026-10-22 의뢰인: 「근무지 설정은 주소 검색도 안 되고 좌표를 직접 넣어야 해서 굉장히 불편하다」). 관리자만.
// 화면은 다음(카카오) 우편번호 창으로 주소를 고르고, 고른 주소를 여기에 보내 좌표를 받는다.
//   · KAKAO_REST_KEY가 있으면 카카오 로컬 주소 검색(도로명 · 지번 모두 정확) — 결정 사항 개발-53
//   · 없으면 오픈스트리트맵 Nominatim(열쇠 없음, 1초에 한 번 정도만) — 도로명이 안 맞으면 지번 · 동 단위로 낮춰 찾고, 그때는 approx(대략)로 알린다
// 좌표는 늘 지도에서 핀으로 다시 맞출 수 있다. 실패해도 저장을 막지 않는다(화면이 지도에서 직접 고르게 안내).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';

type Hit = { lat: number; lng: number; approx: boolean; source: 'naver' | 'kakao' | 'osm' };
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200) : '');

// 네이버 클라우드 Geocoding (2026-10-22 의뢰인: 지도는 네이버로) — 열쇠가 있으면 가장 먼저 쓴다
async function naver(q: string, id: string, secret: string): Promise<Hit | null> {
  const r = await fetch(`https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(q)}&count=1`, {
    headers: { 'x-ncp-apigw-api-key-id': id, 'x-ncp-apigw-api-key': secret, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { addresses?: { x: string; y: string }[] };
  const h = d.addresses?.[0];
  return h ? { lat: Number(h.y), lng: Number(h.x), approx: false, source: 'naver' } : null;
}

async function kakao(q: string, key: string): Promise<Hit | null> {
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=1`, { headers: { Authorization: `KakaoAK ${key}` }, cache: 'no-store' });
  if (!r.ok) return null;
  const d = (await r.json()) as { documents?: { x: string; y: string }[] };
  const h = d.documents?.[0];
  return h ? { lat: Number(h.y), lng: Number(h.x), approx: false, source: 'kakao' } : null;
}

async function osm(q: string): Promise<{ lat: number; lng: number } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&limit=1&accept-language=ko&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'mrcnp-attendance/1.0 (office location setup)' },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { lat: string; lon: string }[];
  return d[0] ? { lat: Number(d[0].lat), lng: Number(d[0].lon) } : null;
}

export const POST = api('admin.geocode', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  // 정확한 것부터: 도로명 → 지번 → 시 · 구 · 동(대략)
  const tries = [clean(b.road), clean(b.jibun)].filter(Boolean);
  const area = clean(b.area);
  if (tries.length === 0 && !area) throw new ApiError(400, 'invalid_input');
  const nid = process.env.NAVER_GEOCODE_ID;
  const nsecret = process.env.NAVER_GEOCODE_SECRET;
  if (nid && nsecret) {
    for (const q of tries) {
      const h = await naver(q, nid, nsecret).catch(() => null);
      if (h) return h;
    }
  }
  const key = process.env.KAKAO_REST_KEY;
  if (key) {
    for (const q of tries) {
      const h = await kakao(q, key).catch(() => null);
      if (h) return h;
    }
  }
  for (const q of tries) {
    const h = await osm(q).catch(() => null);
    if (h) return { ...h, approx: false, source: 'osm' } satisfies Hit;
  }
  if (area) {
    const h = await osm(area).catch(() => null);
    if (h) return { ...h, approx: true, source: 'osm' } satisfies Hit;
  }
  throw new ApiError(404, 'geocode_none');
});
