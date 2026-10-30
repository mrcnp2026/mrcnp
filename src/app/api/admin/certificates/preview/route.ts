// 증명서 미리보기 PDF (2026-10-30 의뢰인: 「미리보기 · 편집 후 PDF」) — 발급 전, 「견본」이 찍힌 실제 PDF를 그대로 보여 준다(저장하지 않는다). 최고관리자만.
//   ?id=신청 id  또는  ?employeeId=…&kind=…&purpose=…&copies=…  ·  &e=고친 칸(JSON을 base64url로)
import { getLocale } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { certPdfFromSnapshot } from '@/lib/cert-pdf';
import { certAllowed, cleanCertEdits, cleanCertInput, loadCert, snapshotOf } from '@/lib/certificates';
import { deny } from '@/lib/csv-response';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const q = new URL(req.url).searchParams;
  let raw: unknown = {};
  try {
    raw = q.get('e') ? JSON.parse(Buffer.from(q.get('e')!, 'base64url').toString('utf8')) : {};
  } catch {
    return deny(400, 'invalid_input');
  }
  const edits = cleanCertEdits(raw);
  if (!edits) return deny(400, 'invalid_input');
  let base: { employeeId: string; kind: 'EMPLOYMENT' | 'CAREER' | 'RETIREMENT'; purpose: string; copies: number } | null = null;
  const id = q.get('id');
  if (id) {
    if (!UUID.test(id)) return deny(404, 'not_found');
    const c = await loadCert(id);
    if (!c || c.state !== 'REQUESTED') return deny(404, 'not_found');
    base = { employeeId: c.employeeId, kind: c.kind, purpose: c.purpose, copies: c.copies };
  } else {
    const c = cleanCertInput({ kind: q.get('kind'), purpose: q.get('purpose'), copies: q.get('copies') ?? 1 });
    const employeeId = q.get('employeeId') ?? '';
    if (!c || !UUID.test(employeeId)) return deny(400, 'invalid_input');
    base = { employeeId, ...c };
  }
  const ok = await certAllowed(base.employeeId, base.kind);
  if (!ok.ok) return deny(400, ok.code);
  const snap = { ...(await snapshotOf(base.employeeId, base.kind, base.purpose)), ...edits };
  const bytes = await certPdfFromSnapshot(snap, { serial: null, copies: base.copies, sample: true, locale: await getLocale() });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="preview.pdf"', 'cache-control': 'private, no-store' } });
}
