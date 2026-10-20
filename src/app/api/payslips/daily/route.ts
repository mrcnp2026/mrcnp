// 내 일용 지급명세서 PDF (2026-10-20, 미구현 #12). 본인 것 · 확정한 대장만 — 아니면 「없음」으로 답한다.
import { randomUUID } from 'node:crypto';
import { getLocale } from 'next-intl/server';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { loadMyDaily } from '@/lib/payroll/daily-data';
import { dailyPdfBytes, pdfResponse } from '@/lib/payroll/paper-pdf';
import { payrollAudit } from '@/lib/payroll/staff-data';

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me) return deny(401, 'not_signed_in');
  const run = new URL(req.url).searchParams.get('run') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run)) return deny(404, 'not_found');
  const found = (await loadMyDaily(me, OFFICE.practiceMode)).find((x) => x.run.id === run);
  if (!found) return deny(404, 'not_found');
  const requestId = randomUUID();
  await payrollAudit({ actorId: me.id, action: 'daily.pdf.self', table: 'payroll_daily_statements', subjectId: found.line.payeeId, runId: run, employeeId: me.id, requestId, detail: { revision: found.run.revision } });
  const { bytes, file } = await dailyPdfBytes(found.run, found.line, await getLocale());
  return pdfResponse(bytes, file, `daily_${found.run.periodFrom.slice(0, 7).replace('-', '')}_rev${found.run.revision}.pdf`, requestId);
}
