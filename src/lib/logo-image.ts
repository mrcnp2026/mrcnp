// 올린 회사 로고를 지금 로고처럼 다듬는다 (2026-10-18 의뢰인: 로고를 넣었을 때 지금처럼 크기가 잘 맞아야 한다).
// 지금 로고(public/brand/logo.png)도 원본(logo.jpg)에서 여백을 잘라 만들었다 — 같은 일을 자동으로:
//   ① 사방의 같은 색(흰 바탕 · 투명) 여백을 잘라 낸다 ② 높이 240px로 맞춘다(작은 그림은 키우지 않는다) ③ PNG로 저장
// 화면은 높이만 정하고 너비는 비율대로 그린다(components/Logo) — 여백이 없으니 어떤 그림이든 지금 로고와 같은 높이로 보인다. 서버 전용.
import 'server-only';
import sharp from 'sharp';
import { ICON_SIZES, type IconSize } from '@/config/brand';
import { ICON_BG } from '@/config/theme';

export const LOGO_HEIGHT = 240;

export async function tidyLogo(input: Uint8Array, opts: { trim?: boolean } = {}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  let img = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  // 편집 창(ImageCropper)에서 맞춘 그림은 사람이 정한 여백을 그대로 둔다 (2026-11-03)
  if (opts.trim === false) {
    const out = await img.resize({ height: LOGO_HEIGHT, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(out.data), width: out.info.width, height: out.info.height };
  }
  // 여백 자르기 — 왼쪽 위 점의 색을 바탕으로 본다(흰 바탕 · 투명 모두). 거의 같은 색(차이 10)까지 여백으로 친다
  const trimmed = await img.trim({ threshold: 10 }).toBuffer({ resolveWithObject: true }).catch(() => null);
  if (trimmed && trimmed.info.width > 8 && trimmed.info.height > 8) img = sharp(trimmed.data);
  const out = await img.resize({ height: LOGO_HEIGHT, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(out.data), width: out.info.width, height: out.info.height };
}

/** 앱 아이콘 (2026-11-03 의뢰인) — 정사각 그림에서 폰 홈 화면 · 탭 아이콘 크기들을 만든다. maskable은 안전 영역(가운데 80%) 안에 들어가게 여백을 둔다 */
export { ICON_SIZES, type IconSize };
export async function makeIcons(input: Uint8Array): Promise<Record<IconSize, Uint8Array>> {
  const base = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('icon_type');
  // 아이콘은 투명 바탕이면 폰마다 검게 보이기도 해서 흰 바탕으로 채운다
  const square = await base.resize(1024, 1024, { fit: 'contain', background: ICON_BG }).flatten({ background: ICON_BG }).png().toBuffer();
  const one = async (n: number) => new Uint8Array(await sharp(square).resize(n, n).png({ compressionLevel: 9 }).toBuffer());
  const inner = await sharp(square).resize(410, 410).png().toBuffer();
  const mask = new Uint8Array(await sharp({ create: { width: 512, height: 512, channels: 4, background: ICON_BG } }).composite([{ input: inner, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer());
  return { s64: await one(64), s180: await one(180), s192: await one(192), s512: await one(512), mask512: mask };
}
