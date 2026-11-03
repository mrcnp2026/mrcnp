// 앱 아이콘 올리기 · 되돌리기 (2026-11-03 의뢰인) — 숫자 4자리로 연 최고관리자만. 회사 로고(logo/route.ts)와 같은 길.
// 정사각 그림 한 장(편집 창에서 맞춘 것)에서 64 · 180 · 192 · 512 · maskable 512를 만들어 사진 저장소(content)의 brand/icon-<id>/ 에 둔다.
// 브라우저 탭 · 홈 화면에 추가할 때 이 아이콘이 쓰인다. ⚠️ 이미 홈 화면에 추가한 폰은 다시 추가해야 바뀐다(폰이 아이콘을 따로 저장한다).
import { randomUUID } from 'node:crypto';
import { api, ApiError } from '@/lib/api';
import { putCompanyProfile } from '@/lib/company';
import { requireConsole } from '@/lib/console-pin';
import { ICON_SIZES, makeIcons, type IconSize } from '@/lib/logo-image';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX = 3 * 1024 * 1024;

export const POST = api('admin.company.icon', async (req) => {
  const me = await requireConsole();
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'invalid_input');
  if (file.size === 0 || file.size > MAX) throw new ApiError(413, 'logo_too_large');
  const icons = await makeIcons(new Uint8Array(await file.arrayBuffer())).catch(() => null);
  if (!icons) throw new ApiError(415, 'logo_type');
  const dir = `brand/icon-${randomUUID()}`;
  const store = createAdminClient().storage.from('content');
  for (const k of Object.keys(ICON_SIZES) as IconSize[]) {
    const up = await store.upload(`${dir}/${k}.png`, icons[k], { contentType: 'image/png', upsert: false });
    if (up.error) throw new Error(`company.icon: ${up.error.message}`);
  }
  await putCompanyProfile({ iconPath: dir, iconAt: new Date().toISOString() }, me.id); // 예전 파일은 이력 때문에 지우지 않는다
  return { ok: true };
});

export const DELETE = api('admin.company.icon.reset', async () => {
  const me = await requireConsole();
  await putCompanyProfile({ iconPath: null, iconAt: new Date().toISOString() }, me.id);
  return { ok: true };
});
