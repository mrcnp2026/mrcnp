// 직원별 계약 · 세무 · 개인 항목 저장 (PRD v1.3 5 · 18.1장). 급여 담당 관리자만.
// 계약 · 세무는 새 판으로 쌓인다(고치거나 지우지 않는다). 개인 항목은 붙이고 끝낸다.
import { api, ApiError, readJson } from '@/lib/api';
import { assertStaffTarget } from '@/lib/staff-data';
import { validateContract, validateItemAssign, validateTax } from '@/lib/payroll/contract';
import { requirePayroll } from '@/lib/payroll/data';
import { cleanText, isDate } from '@/lib/payroll/settings';
import { disableSensitive, revealSensitive, saveSensitive } from '@/lib/payroll/sensitive';
import { SENSITIVE_KINDS, type SensitiveKind } from '@/lib/payroll/sensitive-core';
import { addStaffItem, cancelScheduledVersion, endStaffItem, saveContract, saveTax } from '@/lib/payroll/staff-data';
import { toKstDate } from '@/lib/time';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.payroll.staff', async (req, ctx) => {
  const me = await requirePayroll();
  const { id } = await ctx.params;
  // 등급 보호(개발-39 · 문제 R19): 최고관리자 · 대표자의 것은 최고관리자 · 대표자만 바꾼다
  await assertStaffTarget(me.id, id, 'edit');
  if (!UUID.test(id)) throw new ApiError(400, 'invalid_input');
  const b = await readJson(req);
  const { data: p } = await createAdminClient().from('profiles').select('id').eq('id', id).maybeSingle();
  if (!p) throw new ApiError(404, 'not_found');
  if (b.action === 'contract' || b.action === 'tax') {
    const reason = cleanText(b.reason, 500);
    if (!isDate(b.validFrom) || reason === undefined || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
    const common = { employeeId: id, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion as number, me, requestId: ctx.requestId };
    if (b.action === 'contract') {
      const v = validateContract(b);
      if (!v.ok) throw new ApiError(400, v.code);
      return { version: (await saveContract({ ...common, input: v.value })).version };
    }
    const v = validateTax(b);
    if (!v.ok) throw new ApiError(400, v.code);
    return { version: (await saveTax({ ...common, input: v.value })).version };
  }
  if (b.action === 'contract.cancel' || b.action === 'tax.cancel') {
    // 아직 시작하지 않은 변경 취소 (2026-10-25)
    if (typeof b.versionId !== 'string' || !UUID.test(b.versionId)) throw new ApiError(400, 'invalid_input');
    await cancelScheduledVersion({ kind: b.action === 'contract.cancel' ? 'contract' : 'tax', id: b.versionId, employeeId: id, today: toKstDate(new Date()), me, requestId: ctx.requestId });
    return { ok: true };
  }
  if (b.action === 'item.add') {
    const v = validateItemAssign(b);
    if (!v.ok) throw new ApiError(400, v.code);
    if (!isDate(b.validFrom)) throw new ApiError(400, 'invalid_input');
    await addStaffItem({ employeeId: id, input: v.value, validFrom: b.validFrom, me, requestId: ctx.requestId });
    return { ok: true };
  }
  if (b.action === 'item.end') {
    if (typeof b.itemId !== 'string' || !UUID.test(b.itemId) || !isDate(b.endOn)) throw new ApiError(400, 'invalid_input');
    await endStaffItem({ id: b.itemId, employeeId: id, endOn: b.endOn, me, requestId: ctx.requestId });
    return { ok: true };
  }
  // 민감정보(급여-36) — 원문은 요청 본문에만 있고 기록 · 오류에는 남지 않는다
  if (b.action === 'sensitive.save') {
    const kind = b.kind as SensitiveKind;
    const needBasis = cleanText(b.needBasis, 300);
    if (!SENSITIVE_KINDS.includes(kind) || !needBasis || needBasis.length < 2) throw new ApiError(400, 'invalid_input');
    return saveSensitive({ employeeId: id, kind, raw: b.value, bank: b.bank, needBasis, me, requestId: ctx.requestId });
  }
  if (b.action === 'sensitive.disable' || b.action === 'sensitive.view') {
    if (typeof b.recordId !== 'string' || !UUID.test(b.recordId)) throw new ApiError(400, 'invalid_input');
    if (b.action === 'sensitive.disable') {
      await disableSensitive({ recordId: b.recordId, employeeId: id, me, requestId: ctx.requestId });
      return { ok: true };
    }
    const reason = cleanText(b.reason, 300);
    if (!reason || reason.length < 2) throw new ApiError(400, 'invalid_input');
    return { value: await revealSensitive({ recordId: b.recordId, employeeId: id, reason, me, requestId: ctx.requestId }) };
  }
  throw new ApiError(400, 'invalid_input');
});
