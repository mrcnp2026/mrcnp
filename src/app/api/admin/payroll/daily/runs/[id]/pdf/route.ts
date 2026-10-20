// 일용 대장의 한 사람 지급명세서 PDF (2026-10-20, 미구현 #12). 급여 담당 관리자만. 확정 전이면 쪽마다 「검토용」.
import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { loadDailyBoard } from '@/lib/payroll/daily-data';
import { dailyPdfBytes, pdfResponse } from '@/lib/payroll/paper-pdf';
import { payrollAudit } from '@/lib/payroll/staff-data';

export const maxDuration = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let me;
  try {
    me = await requirePayroll();
  } catch (e) {
    return deny(e instanceof ApiError ? e.status : 500, e instanceof ApiError ? e.code : 'generic');
  }
  const { id } = await ctx.params;
  const payee = new URL(req.url).searchParams.get('payee') ?? '';
  if (!UUID.test(id) || !UUID.test(payee)) return deny(400, 'invalid_input');
  const board = await loadDailyBoard(id, me);
  const line = board?.lines.find((l) => l.payeeId === payee);
  if (!board || !line) return deny(404, 'not_found');
  if (line.state !== 'OK') return deny(409, 'payroll_blocked');
  const requestId = randomUUID();
  await payrollAudit({ actorId: me.id, action: 'daily.pdf', table: 'payroll_daily_statements', subjectId: payee, runId: id, requestId, detail: { status: board.run.status, revision: board.run.revision } });
  const { bytes, file } = await dailyPdfBytes(board.run, line);
  return pdfResponse(bytes, file, `daily_${board.run.periodFrom.slice(0, 7).replace('-', '')}_rev${board.run.revision}.pdf`, requestId);
}
