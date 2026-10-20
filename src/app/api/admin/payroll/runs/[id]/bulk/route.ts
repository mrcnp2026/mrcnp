// 급여대장 「한꺼번에 넣기」 (2026-10-20 노프로 비교) — GET: 엑셀 양식(대상 직원 × 넣을 수 있는 항목) · POST: 올린 파일 미리보기 / 적용 · 같은 금액 여러 명.
// 한 칸 = 한 사람 한 항목의 조정(addOverride). 하나씩 넣는 조정과 같은 길이라 확정 전 대장에만 되고, 다음 계산부터 반영된다. 급여 담당 관리자만.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { api, ApiError, readJson } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { bulkTemplate, readBulk, type BulkLabels } from '@/lib/payroll/bulk-adjust';
import { bulkContext as context } from '@/lib/payroll/bulk-data';
import { requirePayroll } from '@/lib/payroll/data';
import { addOverride } from '@/lib/payroll/run-data';
import ExcelJS from 'exceljs';

export const maxDuration = 60;
const MAX_BYTES = 2 * 1024 * 1024;

async function labels(): Promise<BulkLabels> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.payRuns.bulk' });
  return { sheet: t('sheet'), guide: t('guide'), employeeNo: t('colNo'), name: t('colName'), kind: { PAYMENT: t('kindPay'), DEDUCTION: t('kindDed') } };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requirePayroll();
  } catch {
    return deny(403, 'forbidden');
  }
  const { id } = await ctx.params;
  let x;
  try {
    x = await context(id);
  } catch {
    return deny(404, 'not_found');
  }
  const L = await labels();
  const wb = bulkTemplate(x.members, x.columns, L);
  const name = `${L.sheet}_${x.run.periodFrom.slice(0, 7)}.xlsx`;
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="adjustments.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}

async function applyAll(args: { id: string; items: { employeeId: string; code: string; kind: 'PAYMENT' | 'DEDUCTION'; amount: number }[]; reason: string; me: Me; requestId?: string }) {
  let saved = 0;
  const failed: { employeeId: string; code: string; error: string }[] = [];
  for (const it of args.items) {
    try {
      await addOverride({ id: args.id, employeeId: it.employeeId, itemCode: it.code, kind: it.kind, amount: it.amount, reason: args.reason, me: args.me, requestId: args.requestId });
      saved++;
    } catch (e) {
      failed.push({ employeeId: it.employeeId, code: it.code, error: e instanceof ApiError ? e.code : 'generic' });
    }
  }
  return { saved, failed };
}

export const POST = api<{ params: Promise<{ id: string }> }>('admin.payroll.run.bulk', async (req, ctx) => {
  const me = await requirePayroll();
  const { id } = await ctx.params;
  const x = await context(id);
  if (x.run.status === 'FINALIZED') throw new ApiError(409, 'payroll_finalized');
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    // 같은 금액을 여러 명에게 (상여 · 성과급 일괄 지급 등)
    const b = await readJson(req);
    const col = x.columns.find((c) => c.code === b.itemCode);
    const amount = typeof b.amount === 'number' ? b.amount : typeof b.amount === 'string' && /^-?\d{1,12}$/.test(b.amount.replace(/,/g, '').trim()) ? Number(b.amount.replace(/,/g, '')) : NaN;
    const ids = Array.isArray(b.employeeIds) ? (b.employeeIds as unknown[]).filter((v): v is string => typeof v === 'string' && x.members.some((m) => m.employeeId === v)) : [];
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 300) : '';
    if (!col || !Number.isSafeInteger(amount) || !ids.length) throw new ApiError(400, 'invalid_input');
    if (col.kind === 'PAYMENT' && amount < 0) throw new ApiError(400, 'payroll_negative_pay');
    if (reason.length < 2) throw new ApiError(400, 'payroll_reason_required');
    return applyAll({ id, items: ids.map((employeeId) => ({ employeeId, code: col.code, kind: col.kind, amount })), reason, me, requestId: ctx.requestId });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File) || file.size === 0) throw new ApiError(400, 'import_no_file');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'import_too_big');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ApiError(400, 'import_bad_file');
  }
  const all: unknown[][] = [];
  wb.worksheets[0]?.eachRow({ includeEmpty: true }, (row) => all.push((row.values as unknown[]).slice(1)));
  const lines = readBulk(all, x.columns, x.members, await labels());
  if (!lines) throw new ApiError(400, 'import_bad_file');
  if (form.get('apply') !== '1') return { lines, columns: x.columns };
  const items = lines.filter((l) => !l.error && l.employeeId).flatMap((l) => l.cells.map((c) => ({ employeeId: l.employeeId!, ...c })));
  return { lines, columns: x.columns, ...(await applyAll({ id, items, reason: `엑셀 일괄 입력 · ${file.name}`.slice(0, 300), me, requestId: ctx.requestId })) };
});
