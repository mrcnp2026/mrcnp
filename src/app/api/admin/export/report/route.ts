// 월별 근태 증빙 엑셀 (②-4 7-5) — 인쇄해서 바로 보고하는 양식 (2026-10-02 의뢰인).
// ★ 내려주기 전에 download_logs에 먼저 쓴다 — 쓰기가 실패하면 내려주지 않는다 (7-18 요점 1: 개인정보 반출의 증거).
// 모든 관리자가 받을 수 있다 (금액 없음, R-10-6).
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { OFFICE } from '@/config/office';
import { buildAttendanceReport, reportFileName } from '@/lib/attendance-report';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { buildAttendanceWorkbook } from '@/lib/export-xlsx';
import { isYearMonth, monthRange } from '@/lib/month-data';
import { isPeriodLocked } from '@/lib/punch';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const ym = req.nextUrl.searchParams.get('m');
  if (!isYearMonth(ym)) return deny(400, 'invalid_input');
  const practice = OFFICE.practiceMode && req.nextUrl.searchParams.get('live') !== '1';
  const now = new Date();
  // 월 잠금(②-3)이 아직 없어 모든 달이 "마감 전"이다 — 사실대로 표시한다 (7-18 요점 3)
  const unlocked = !(await isPeriodLocked('', monthRange(ym).from));
  const fileName = reportFileName(ym, now, unlocked, practice);

  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'attendance_report', scope: practice ? `${ym}:practice` : ym, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');

  const wb = buildAttendanceWorkbook(await buildAttendanceReport(ym, practice, me.name, unlocked));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 한글 파일 이름: RFC 5987 (iOS·크롬), 옛 브라우저용 ASCII 이름도 함께
      'content-disposition': `attachment; filename="attendance-report_${ym}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
