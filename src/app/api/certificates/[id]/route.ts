// 증명서 PDF 내려받기 (2026-10-29 남은 일 9-3) — 발급한 것만. 본인 것 또는 최고관리자. 내려받으면 내려받기 기록이 남는다.
import { randomUUID } from 'node:crypto';
import { getLocale } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { certPdfBytes } from '@/lib/cert-pdf';
import { loadCert } from '@/lib/certificates';
import { deny } from '@/lib/csv-response';
import { pdfResponse } from '@/lib/payroll/paper-pdf';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me) return deny(401, 'not_signed_in');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(404, 'not_found');
  const c = await loadCert(id);
  if (!c || c.state !== 'ISSUED' || (c.employeeId !== me.id && me.role !== 'admin')) return deny(404, 'not_found');
  const requestId = randomUUID();
  const { bytes, file } = await certPdfBytes(c, await getLocale());
  await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'certificate', scope: c.serial ?? c.id, file_name: file, purpose: c.purpose });
  // ?view=1 — 새 탭에서 바로 보기(받지 않고 연다). 그 밖에는 내려받기
  if (new URL(req.url).searchParams.get('view') === '1') {
    return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="certificate_${c.serial}.pdf"; filename*=UTF-8''${encodeURIComponent(file)}`, 'cache-control': 'private, no-store', 'x-request-id': requestId } });
  }
  return pdfResponse(bytes, file, `certificate_${c.serial}.pdf`, requestId);
}
