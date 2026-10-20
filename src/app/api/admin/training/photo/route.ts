// 교육 현장 사진 (묶음 33) — POST: 올리기(관리자, sessionId · file) · GET ?id=: 보기(관리자 또는 그 교육의 대상 직원). 비공개 저장소에서 서버가 내려 준다.
import { api, ApiError } from '@/lib/api';
import { getMe, requireAdmin } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { createAdminClient } from '@/lib/supabase/admin';
import { addPhoto, photoFile } from '@/lib/training-data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.training.photo', async (req) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const form = await req.formData().catch(() => null);
  const sessionId = form?.get('sessionId');
  const file = form?.get('file');
  if (typeof sessionId !== 'string' || !UUID.test(sessionId) || !(file instanceof File)) throw new ApiError(400, 'invalid_input');
  return { id: await addPhoto({ sessionId, file, me }) };
});

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  const id = new URL(req.url).searchParams.get('id');
  if (!me || !id || !UUID.test(id)) return deny(403, 'forbidden');
  if (me.role !== 'admin') {
    const db = createAdminClient();
    const { data: p } = await db.from('training_photos').select('session_id').eq('id', id).maybeSingle();
    const { data: a } = p ? await db.from('training_attendees').select('id').eq('session_id', p.session_id).eq('employee_id', me.id).is('removed_at', null).maybeSingle() : { data: null };
    if (!a) return deny(403, 'forbidden');
  }
  const f = await photoFile(id);
  if (!f) return deny(404, 'not_found');
  return new Response(f.body, { headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=300', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}` } });
}
