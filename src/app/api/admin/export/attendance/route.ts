// 근태 증빙 CSV (①-4 7-10) — 기록 1건 = 1행. 원본 시각과 정정 시각을 **각각 별도 열**로 (3년 보존의 의미).
// 빠진 기록 추가(add_missing)는 원본 열이 비어 있고 정정 열에만 값이 있다 — "원래 없던 기록"이 드러나게.
// 모든 관리자가 받을 수 있다 (금액 없음, R-10-6). 원본 행은 하나도 빠지지 않는다 (무효 정정도 원본은 나온다).
import type { NextRequest } from 'next/server';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { csvResponse, deny } from '@/lib/csv-response';
import { isYearMonth, monthRange } from '@/lib/month-data';
import { exportFileName, toCsv } from '@/lib/monthly';
import { loadPeriod } from '@/lib/period-data';

const COLUMNS = [
  'employee_no', 'name', 'work_date', 'kind', 'original_punched_at', 'corrected_punched_at', 'correction_type',
  'correction_reason', 'ip_verified', 'source', 'is_test', 'record_note',
] as const;

const kst = new Intl.DateTimeFormat('sv-SE', {
  timeZone: OFFICE.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const fmt = (d: Date | null) => (d ? kst.format(d) : null); // 'YYYY-MM-DD HH:MM:SS' 사무실 시각

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const ym = req.nextUrl.searchParams.get('m');
  if (!isYearMonth(ym)) return deny(400, 'invalid_input');
  const practice = OFFICE.practiceMode && req.nextUrl.searchParams.get('live') !== '1';
  const { from, to } = monthRange(ym);
  const data = await loadPeriod(from, to, practice);
  const person = new Map(data.people.map((p) => [p.id, p]));
  const approved = data.corrections.filter((c) => c.status === 'approved');

  const rows: (string | number | null)[][] = [];
  for (const e of data.events.filter((x) => x.workDate >= from && x.workDate <= to)) {
    const c = approved.find((x) => x.targetId === e.id);
    const p = person.get(e.employeeId);
    rows.push([
      p?.employeeNo ?? null, p?.name ?? null, e.workDate, e.kind, fmt(e.punchedAt),
      c?.correctionType === 'modify' ? fmt(c.newPunchedAt) : null, c?.correctionType ?? null, c?.reason ?? null,
      e.ipVerified ? 'Y' : 'N', e.source, practice ? 'Y' : 'N', e.note,
    ]);
  }
  for (const c of approved.filter((x) => x.correctionType === 'add_missing' && x.workDate >= from && x.workDate <= to)) {
    const p = person.get(c.employeeId);
    rows.push([p?.employeeNo ?? null, p?.name ?? null, c.workDate, c.kind, null, fmt(c.newPunchedAt), 'add_missing', c.reason, 'N', 'correction', practice ? 'Y' : 'N', null]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])) || String(a[4] ?? a[5]).localeCompare(String(b[4] ?? b[5])));
  return csvResponse(toCsv(COLUMNS, rows), exportFileName('attendance', practice ? `${ym}-practice` : ym, new Date()));
}
