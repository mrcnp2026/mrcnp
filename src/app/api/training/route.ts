// 직원 교육 확인 · 서명 (묶음 33, 2026-10-20) — POST {sessionId, signature?}: 로그인한 본인만. 서명 그림은 교육 종류에서 켰을 때 꼭 있어야 한다.
// GET ?session=&employee=: 서명 그림(SVG) — 본인 또는 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { loadSignature, sign } from '@/lib/training-data';
import { cleanSignature } from '@/lib/training-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('training.sign', async (req) => {
  const me = await getMe();
  if (!me) throw new ApiError(401, 'not_signed_in');
  const b = await readJson(req);
  if (typeof b.sessionId !== 'string' || !UUID.test(b.sessionId)) throw new ApiError(400, 'invalid_input');
  if (b.agreed !== true) throw new ApiError(400, 'training_consent_required'); // 4가지 확인 체크 (2026-10-22)
  const signature = cleanSignature(b.signature);
  if (signature === undefined) throw new ApiError(400, 'training_signature_bad');
  await sign({ sessionId: b.sessionId, employeeId: me.id, method: 'APP', signature, note: null });
  return { ok: true };
});

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  const q = new URL(req.url).searchParams;
  const session = q.get('session'), employee = q.get('employee');
  if (!me || !session || !employee || !UUID.test(session) || !UUID.test(employee) || (me.id !== employee && me.role !== 'admin')) return deny(403, 'forbidden');
  const path = await loadSignature(session, employee);
  if (!path) return deny(404, 'not_found');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="300" height="100"><path d="${path}" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'private, max-age=300' } });
}
