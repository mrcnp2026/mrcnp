// 휴가 리포트 엑셀 (PRD v1.3 37.5). 관리자만. 화면과 같은 계산 · 같은 조건으로 만든다. 휴가 사유는 없다.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildLeaveReport, leaveReportWorkbook } from '@/lib/report-leave';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const u = new URL(req.url);
  const to = u.searchParams.get('to') ?? toKstDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) return deny(400, 'invalid_input');
  const groups = await loadOrgGroups();
  const g = u.searchParams.get('g');
  const groupId = g && groups.some((x) => x.id === g) ? g : null;
  const practice = OFFICE.practiceMode && u.searchParams.get('live') !== '1';
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.reports' });
  const r = await buildLeaveReport({ asOf: to, practice, groupId, withInactive: u.searchParams.get('inactive') === '1' });
  const fileName = `${t('leaveFile')}_${to.replace(/-/g, '')}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'leave_dept_report', scope: to, file_name: fileName });
  if (error) return deny(500, 'download_log_failed');
  const wb = leaveReportWorkbook(r, { company: BRAND.name, by: me.name, groupName: groupId ? (groupPath(groups, groupId) ?? '') : t('all'), unassigned: t('unassigned') });
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="leave-report_${to.replace(/-/g, '')}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
