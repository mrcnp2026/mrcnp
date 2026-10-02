// 급여용 CSV (①-4 7-10 exportForPayroll). 한 행 = 직원 × 월, 금액 0칸 (4-4).
// ★ 급여 담당자(can_view_payroll)만 (부록 R-2의 7, R-11 #4). 메뉴 숨김이 아니라 서버가 막는다.
// 연습 모드의 연습 기록으로는 만들지 않는다 — 급여로 넘어가는 통로이기 때문 (4-6)
import type { NextRequest } from 'next/server';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { csvResponse, deny } from '@/lib/csv-response';
import { buildMonth, isYearMonth } from '@/lib/month-data';
import { exportFileName, PAYROLL_COLUMNS, toCsv } from '@/lib/monthly';

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  if (!me.canViewPayroll) return deny(403, 'payroll_only');
  const ym = req.nextUrl.searchParams.get('m');
  if (!isYearMonth(ym)) return deny(400, 'invalid_input');
  const practice = OFFICE.practiceMode && req.nextUrl.searchParams.get('live') !== '1';
  const { rows } = await buildMonth(ym, practice);
  const body = toCsv(PAYROLL_COLUMNS, rows.map((r) => PAYROLL_COLUMNS.map((c) => r.summary.row[c])));
  return csvResponse(body, exportFileName('payroll', practice ? `${ym}-practice` : ym, new Date()));
}
