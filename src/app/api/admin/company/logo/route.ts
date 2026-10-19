// 회사 로고 올리기 · 되돌리기 (2026-10-18 의뢰인: 회사가 로고를 바꾸면 화면에서 바꾼다) — 숫자 4자리로 연 최고관리자만.
// 파일은 사진 저장소(content)의 brand/ 아래. PNG · JPG · WEBP, 3MB 이하 — 올리면 여백을 잘라 지금 로고와 같은 높이로 다듬는다. 되돌리기(DELETE)는 원래 로고로.
// ⚠️ 폰 홈 화면 아이콘(public/brand/icon-*.png)은 앱 설치 파일이라 여기서 바뀌지 않는다.
import { randomUUID } from 'node:crypto';
import { api, ApiError } from '@/lib/api';
import { putCompanyProfile } from '@/lib/company';
import { requireConsole } from '@/lib/console-pin';
import { tidyLogo } from '@/lib/logo-image';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX = 3 * 1024 * 1024;
function sniff(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export const POST = api('admin.company.logo', async (req) => {
  const me = await requireConsole();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'invalid_input');
  if (file.size === 0 || file.size > MAX) throw new ApiError(413, 'logo_too_large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) throw new ApiError(415, 'logo_type');
  // 지금 로고처럼 다듬는다 — 여백 자르기 · 높이 240px · PNG (lib/logo-image.ts). 그림으로 읽히지 않으면 거절
  const tidy = await tidyLogo(bytes).catch(() => null);
  if (!tidy) throw new ApiError(415, 'logo_type');
  const path = `brand/logo-${randomUUID()}.png`;
  const up = await createAdminClient().storage.from('content').upload(path, tidy.bytes, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(`company.logo: ${up.error.message}`);
  await putCompanyProfile({ logoPath: path, logoMime: 'image/png', logoAt: new Date().toISOString() }, me.id); // 예전 파일은 이력 때문에 지우지 않는다
  return { ok: true };
});

export const DELETE = api('admin.company.logo.reset', async () => {
  const me = await requireConsole();
  await putCompanyProfile({ logoPath: null, logoMime: null, logoAt: new Date().toISOString() }, me.id);
  return { ok: true };
});
