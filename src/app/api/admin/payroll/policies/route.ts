// 회사 정책 — 법정수당의 회사 기준 · 연차 산정 (PRD v1.3 17.6 · 36.1). 급여 담당 관리자만.
// 값은 전부 「임시」로 들어가고, 경영지원실의 노무 검증을 받은 뒤 「검증됨」으로 바꾼다 (/api/admin/payroll/verify).
import { api, ApiError, readJson } from '@/lib/api';
import { requireConsole } from '@/lib/console-pin';
import { loadPolicies, requirePayroll, savePolicy, setPolicyUse } from '@/lib/payroll/data';
import { ALLOWANCE_KINDS, cleanText, isDate, STANDARD_ALLOWANCES, STANDARD_ANNUAL_LEAVE, validateAllowance, type AllowanceKind } from '@/lib/payroll/settings';
import { toKstDate } from '@/lib/time';

export const POST = api('admin.payroll.policies', async (req) => {
  await requireConsole(); // 통합설정 잠금 — 숫자 4자리로 연 관리자만 (2026-10-14 결정 사항 개발-29)
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'use') {
    if (typeof b.id !== 'string' || typeof b.inUse !== 'boolean') throw new ApiError(400, 'invalid_input');
    await setPolicyUse(b.id, b.inUse);
    return { ok: true };
  }
  if (b.action === 'seed') {
    const have = new Set([...(await loadPolicies('allowance.')), ...(await loadPolicies('leave.'))].map((x) => x.kind));
    const from = toKstDate(new Date()).slice(0, 4) + '-01-01';
    let added = 0;
    for (const k of ALLOWANCE_KINDS.filter((x) => !have.has('allowance.' + x))) {
      await savePolicy({ kind: 'allowance.' + k, payload: STANDARD_ALLOWANCES[k], validFrom: from, reason: null, expectedVersion: 0, me });
      added++;
    }
    if (!have.has('leave.annual-accrual')) {
      await savePolicy({ kind: 'leave.annual-accrual', payload: STANDARD_ANNUAL_LEAVE, validFrom: from, reason: null, expectedVersion: 0, me });
      added++;
    }
    return { added };
  }
  const kind = typeof b.kind === 'string' && (ALLOWANCE_KINDS as readonly string[]).includes(b.kind) ? (b.kind as AllowanceKind) : null;
  const v = validateAllowance(b);
  const reason = cleanText(b.reason, 500);
  if (!kind || !v.ok || !isDate(b.validFrom) || reason === undefined || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
  const row = await savePolicy({ kind: 'allowance.' + kind, payload: v.value, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion as number, me });
  return { version: row.version };
});
