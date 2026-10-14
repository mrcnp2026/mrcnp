// 「임시 / 검증됨」 표시 바꾸기 — 경영지원실 담당자의 노무 · 세무 검증 결과를 남긴다 (2026-10-13 의뢰인). 급여 담당 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { requirePayroll, setVerification } from '@/lib/payroll/data';
import { cleanText } from '@/lib/payroll/settings';

const TARGETS = ['setting', 'item', 'policy', 'reference'] as const;

export const POST = api('admin.payroll.verify', async (req) => {
  await requireConsole(); // 통합설정 잠금 — 숫자 4자리로 연 관리자만 (2026-10-14 결정 사항 개발-29)
  await requirePayroll();
  const b = await readJson(req);
  const target = TARGETS.find((x) => x === b.target);
  const note = cleanText(b.note, 500);
  if (!target || typeof b.id !== 'string' || (b.state !== 'TEMPORARY' && b.state !== 'VERIFIED') || note === undefined) throw new ApiError(400, 'invalid_input');
  await setVerification(target, b.id, b.state, note);
  return { ok: true };
});
