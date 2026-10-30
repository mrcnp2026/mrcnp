// 증명서 발급 · 반려 · 바로 발급 (2026-10-29 남은 일 9-3) — 최고관리자만. 발급하면 발급번호와 그때 내용이 대장에 남는다(고치지 못한다).
import { OFFICE } from '@/config/office';
import { api, ApiError, readJson } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { certAllowed, cleanCertEdits, cleanCertInput, issueCert, rejectCert, snapshotOf } from '@/lib/certificates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api('admin.certificate', async (req) => {
  const me = await getMe();
  if (!me || me.role !== 'admin') throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (b.action === 'issue') {
    if (typeof b.id !== 'string' || !UUID.test(b.id)) throw new ApiError(400, 'invalid_input');
    const edits = cleanCertEdits(b.edits);
    if (!edits) throw new ApiError(400, 'invalid_input');
    const r = await issueCert({ actorId: me.id, id: b.id, edits, practice: OFFICE.practiceMode });
    return { id: r.id, serial: r.serial };
  }
  if (b.action === 'reject') {
    if (typeof b.id !== 'string' || !UUID.test(b.id) || typeof b.reason !== 'string') throw new ApiError(400, 'invalid_input');
    await rejectCert({ id: b.id, reason: b.reason });
    return { ok: true };
  }
  if (b.action === 'direct') {
    const c = cleanCertInput(b);
    if (!c || typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    const edits = cleanCertEdits(b.edits);
    if (!edits) throw new ApiError(400, 'invalid_input');
    const r = await issueCert({ actorId: me.id, direct: { employeeId: b.employeeId, ...c }, edits, practice: OFFICE.practiceMode });
    return { id: r.id, serial: r.serial };
  }
  // 바로 발급 전 미리보기 — 그 사람 · 종류로 증명서에 들어갈 내용을 만들어 돌려준다(저장하지 않는다)
  if (b.action === 'draft') {
    const c = cleanCertInput(b);
    if (!c || typeof b.employeeId !== 'string' || !UUID.test(b.employeeId)) throw new ApiError(400, 'invalid_input');
    const ok = await certAllowed(b.employeeId, c.kind);
    if (!ok.ok) throw new ApiError(400, ok.code);
    return { snapshot: await snapshotOf(b.employeeId, c.kind, c.purpose), copies: c.copies };
  }
  throw new ApiError(400, 'invalid_input');
});
