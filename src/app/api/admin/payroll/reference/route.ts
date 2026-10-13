// 공식 기준 자료 — 수집 결과 가져오기 · 직접 입력 · 확인 후 반영 · 반려 (PRD v1.3 25 · 30장). 급여 담당 관리자만.
// ★ 가져오기와 직접 입력은 「검토 대기」까지만 만든다. 현재 쓰는 값은 관리자가 「확인 후 반영」을 눌러야 바뀐다.
import { api, ApiError, readJson } from '@/lib/api';
import { approveReference, rejectReference, requirePayroll, stageCandidates } from '@/lib/payroll/data';
import { buildManual, mapCollector, REFERENCE_KINDS, type ReferenceKind } from '@/lib/payroll/reference';
import { cleanText, isDate } from '@/lib/payroll/settings';

export const maxDuration = 60;

export const POST = api('admin.payroll.reference', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'import') {
    const { candidates, skipped } = mapCollector(b.latest, b.bands);
    if (!candidates.length) throw new ApiError(422, 'payroll_parse_review');
    const r = await stageCandidates(candidates, 'collected', me);
    return { ...r, skipped };
  }
  if (b.action === 'manual') {
    const kind = (REFERENCE_KINDS as readonly string[]).includes(b.kind as string) ? (b.kind as ReferenceKind) : null;
    const payload = kind ? buildManual(kind, b) : null;
    const note = cleanText(b.sourceNote, 300);
    const validFrom = b.validFrom === null || b.validFrom === '' || b.validFrom === undefined ? null : isDate(b.validFrom) ? b.validFrom : undefined;
    // 근거(고시 번호 · 안내 주소 등)는 꼭 적는다 — 손으로 넣은 값이 어디서 왔는지 남아야 한다
    if (!kind || !payload || !note || validFrom === undefined) throw new ApiError(400, 'invalid_input');
    return await stageCandidates([{ kind, payload, sourceUnit: null, validFrom, validTo: null, authority: note, sourceUrl: null, sourceHash: null, parserVersion: null, warnings: ['manual_entry'] }], 'manual', me);
  }
  if (b.action === 'approve') {
    const reason = cleanText(b.reason, 500);
    const validTo = b.validTo === null || b.validTo === '' || b.validTo === undefined ? null : isDate(b.validTo) ? b.validTo : undefined;
    if (typeof b.id !== 'string' || typeof b.payloadHash !== 'string' || !isDate(b.validFrom) || validTo === undefined || !reason) throw new ApiError(400, 'invalid_input');
    await approveReference({ id: b.id, payloadHash: b.payloadHash, validFrom: b.validFrom, validTo, reason, me });
    return { ok: true };
  }
  if (b.action === 'reject') {
    const reason = cleanText(b.reason, 500);
    if (typeof b.id !== 'string' || !reason) throw new ApiError(400, 'invalid_input');
    await rejectReference(b.id, reason);
    return { ok: true };
  }
  throw new ApiError(400, 'invalid_input');
});
