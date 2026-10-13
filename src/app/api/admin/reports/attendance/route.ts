// 근태 리포트 엑셀 (PRD v1.3 35.4). 관리자만. 화면과 같은 계산 · 같은 조건으로 만든다. 금액은 없다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { isMonth } from '@/lib/close-review';
import { deny } from '@/lib/csv-response';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { attendanceReportWorkbook, buildAttendanceDeptReport } from '@/lib/report-attendance';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const u = new URL(req.url);
  const today = toKstDate(new Date());
  const m = u.searchParams.get('m');
  if (!isMonth(m) || m > today.slice(0, 7)) return deny(400, 'invalid_input');
  const groups = await loadOrgGroups();
  const g = u.searchParams.get('g');
  const groupId = g && groups.some((x) => x.id === g) ? g : null;
  const practice = OFFICE.practiceMode && u.searchParams.get('live') !== '1';
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.reports' });
  const r = await buildAttendanceDeptReport({ ym: m, practice, groupId, basis: u.searchParams.get('basis') === 'current' ? 'current' : 'at_month_end' });
  const fileName = `${t('attFile')}_${m.replace('-', '')}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'attendance_dept_report', scope: m, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');
  const wb = attendanceReportWorkbook(r, { company: BRAND.name, by: me.name, groupName: groupId ? (groupPath(groups, groupId) ?? '') : t('all'), unassigned: t('unassigned') });
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="attendance-report_${m.replace('-', '')}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
