// 「임시 / 검증됨」 표시 바꾸기 — 경영지원실 담당자의 노무 · 세무 검증 결과를 남긴다 (2026-10-13 의뢰인). 급여 담당 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll, setVerification } from '@/lib/payroll/data';
import { cleanText } from '@/lib/payroll/settings';

const TARGETS = ['setting', 'item', 'policy', 'reference'] as const;

export const POST = api('admin.payroll.verify', async (req) => {
  await requirePayroll();
  const b = await readJson(req);
  const target = TARGETS.find((x) => x === b.target);
  const note = cleanText(b.note, 500);
  if (!target || typeof b.id !== 'string' || (b.state !== 'TEMPORARY' && b.state !== 'VERIFIED') || note === undefined) throw new ApiError(400, 'invalid_input');
  await setVerification(target, b.id, b.state, note);
  return { ok: true };
});
