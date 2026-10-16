// 글에 넣는 사진 올리기 (게시판 · 공지 · 업무 메시지, 2026-10-16). 로그인한 사람 누구나 — 공지 사진은 공지 화면(관리자)에서만 쓴다.
// 사진만(jpeg · png · webp · gif), 10MB까지. 파일 내용의 앞부분(서명)으로 종류를 다시 확인한다 — 이름 · 브라우저가 알려 준 종류를 믿지 않는다.
// 파일은 비공개 저장소(content 버킷)에 두고, 보기는 /api/images/<id>(로그인 필요)로만 한다.
import { randomUUID } from 'node:crypto';
import { ApiError, api } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;
const MAX = 10 * 1024 * 1024;
const KINDS = ['board', 'notice', 'message'] as const;

function sniff(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as const;

export const POST = api('images.upload', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') ?? '');
  if (!(file instanceof File) || !(KINDS as readonly string[]).includes(kind)) throw new ApiError(400, 'invalid_input');
  if (kind === 'notice' && me.role !== 'admin') throw new ApiError(403, 'forbidden');
  if (file.size === 0 || file.size > MAX) throw new ApiError(413, 'image_too_large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) throw new ApiError(415, 'image_type');
  const id = randomUUID();
  const now = new Date();
  const path = `${kind}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${EXT[mime]}`;
  const db = createAdminClient();
  const up = await db.storage.from('content').upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    if (/bucket.*not.*found/i.test(up.error.message)) throw new ApiError(503, 'db_update_required');
    throw new Error(`images.upload: ${up.error.message}`);
  }
  const { error } = await db.from('content_images').insert({ id, owner_id: me.id, storage_path: path, mime, bytes: bytes.length, kind });
  if (error) {
    await db.storage.from('content').remove([path]);
    if (error.code === '42P01' || error.code === 'PGRST205') throw new ApiError(503, 'db_update_required');
    throw new Error(`images.insert: ${error.code}`);
  }
  return { id, url: `/api/images/${id}` };
});
