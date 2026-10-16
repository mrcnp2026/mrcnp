// 일용 대장 지급명세 엑셀 (2026-10-14, 미구현 목록 12번) — 대상자별 · 날짜별 · 정보 3시트. 화면과 같은 계산 결과를 값으로만 넣는다(수식 없음).
// 급여 담당 관리자만. 확정 전이면 시트마다 「검토용」. 내려주기 전에 반출 기록(download_logs)을 남긴다. 신고용 서식이 아니다.
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getTranslations } from 'next-intl/server';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { loadDailyBoard } from '@/lib/payroll/daily-data';
import { DAILY_RULE } from '@/lib/payroll/daily';
import { createAdminClient } from '@/lib/supabase/admin';

const MONEY = '#,##0';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin' || !me.canViewPayroll) return deny(403, 'forbidden');
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deny(404, 'not_found');
  const board = await loadDailyBoard(id, me);
  if (!board || !board.run.generationId) return deny(404, 'not_found');
  const { run, lines } = board;
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.daily' });
  const month = run.periodFrom.slice(0, 7);
  const fileName = `${t('x.file', { month, n: run.sequence, rev: run.revision })}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'daily_statements', scope: `${run.id}`, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');
  const draft = run.status !== 'FINALIZED';
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet) => {
    if (draft) ws.addRow([t('x.draft')]).font = { bold: true, color: { argb: 'FFB45309' } };
  };
  const COLS = ['gross', 'taxable', 'nontax', 'incomeTax', 'localTax', 'otherDeduction', 'net'] as const;
  const ok = lines.filter((l) => l.state === 'OK');

  const a = wb.addWorksheet(t('x.sheetPayee'));
  head(a);
  a.addRow([t('x.payee'), t('x.no'), t('cDays'), ...COLS.map((k) => t(`c.${k}`)), t('x.status')]).font = { bold: true };
  for (const l of lines) a.addRow([l.name, l.internalNo, l.workDays ?? '', ...COLS.map((k) => (l.state === 'OK' ? (l[k] ?? 0) : '')), l.state === 'OK' ? '' : l.blockers.map((b) => t(`blocker.${b}`)).join(' / ')]);
  a.addRow([t('x.sum'), '', ok.reduce((s, l) => s + (l.workDays ?? 0), 0), ...COLS.map((k) => ok.reduce((s, l) => s + (l[k] ?? 0), 0)), '']).font = { bold: true };
  a.columns.forEach((c, i) => {
    c.width = i < 2 ? 18 : 14;
    if (i >= 3 && i < 3 + COLS.length) c.numFmt = MONEY;
  });

  const d = wb.addWorksheet(t('x.sheetDay'));
  head(d);
  d.addRow([t('x.payee'), t('x.no'), t('x.date'), t('c.gross'), t('c.incomeTax'), t('c.localTax'), t('c.otherDeduction')]).font = { bold: true };
  for (const l of ok) for (const x of l.days) d.addRow([l.name, l.internalNo, x.workDate, x.gross, x.incomeTax, x.localTax, x.deduction]);
  d.columns.forEach((c, i) => {
    c.width = i < 3 ? 16 : 14;
    if (i >= 3) c.numFmt = MONEY;
  });

  const m = wb.addWorksheet(t('x.sheetMeta'));
  for (const [k, v] of [[t('x.month'), month], [t('x.payDate'), run.payDate], [t('x.status'), draft ? t('x.draft') : t('x.final')], [t('revision', { n: run.revision }), run.correctionReason ?? ''], [t('x.rule'), DAILY_RULE], [t('x.made'), new Date().toISOString()], [t('x.by'), me.name]] as const) m.addRow([k, v]);
  m.getColumn(1).width = 16;
  m.getColumn(2).width = 40;

  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="daily_${month}_${run.sequence}_r${run.revision}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
