// 퇴직연금 DC 은행 납입 엑셀 (묶음 32, 2026-10-20) — ?m=YYYY-MM 그 달 부담금(이름 · 사번 · 금융기관 · 임금총액 · 부담금 · 낸 날)과 누계. 급여 담당 관리자만.
// 은행마다 올리는 양식이 달라 공통 목록으로 준다(은행 양식이 정해지면 그 모양으로 바꾼다).
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { OFFICE } from '@/config/office';
import { deny } from '@/lib/csv-response';
import { requirePayroll } from '@/lib/payroll/data';
import { balanceOf } from '@/lib/payroll/pension';
import { loadPension } from '@/lib/payroll/pension-data';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request): Promise<Response> {
  try {
    await requirePayroll();
  } catch {
    return deny(403, 'forbidden');
  }
  const m = new URL(req.url).searchParams.get('m');
  if (!m || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return deny(400, 'invalid_input');
  const month = `${m}-01`;
  const { members, contributions } = await loadPension(OFFICE.practiceMode);
  const { data: ppl } = await createAdminClient().from('profiles').select('id, name, employee_no').in('id', members.map((x) => x.employeeId).concat(['00000000-0000-0000-0000-000000000000']));
  const who = new Map((ppl ?? []).map((p) => [p.id as string, p]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`퇴직연금 ${m}`);
  ws.addRow(['사번', '이름', '제도', '금융기관', '귀속 달', '임금총액', '부담금', '은행에 낸 날', '적립 누계']);
  ws.getRow(1).font = { bold: true };
  let sum = 0;
  for (const mem of members.filter((x) => x.planKind === 'DC')) {
    const c = contributions.find((x) => x.employeeId === mem.employeeId && x.month === month);
    if (!c) continue;
    const p = who.get(mem.employeeId);
    sum += c.amount;
    ws.addRow([p?.employee_no ?? '', p?.name ?? '', mem.planKind, mem.institution ?? '', m, c.wageTotal, c.amount, c.paidOn ?? '', balanceOf(mem, contributions.filter((x) => x.employeeId === mem.employeeId && x.month <= month))]);
  }
  ws.addRow(['', '합계', '', '', '', '', sum]);
  ws.columns = [{ width: 10 }, { width: 10 }, { width: 6 }, { width: 14 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 13 }, { width: 14 }];
  for (const col of [6, 7, 9]) ws.getColumn(col).numFmt = '#,##0';
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="pension.xlsx"; filename*=UTF-8''${encodeURIComponent(`퇴직연금_납입_${m}.xlsx`)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
