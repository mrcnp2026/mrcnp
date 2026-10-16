// 연간 리포트 엑셀 1년치 (2026-10-16 의뢰인: 연봉 협상 · 인사평가 근거). 관리자만. 화면과 같은 계산 · 같은 조건. 금액은 없다.
// e가 있으면 그 직원 한 명의 1년치.
import { randomUUID } from 'node:crypto';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { deny } from '@/lib/csv-response';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { annualWorkbook, buildAnnualReport } from '@/lib/report-annual';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const me = await getMe();
  if (!me || me.role !== 'admin') return deny(403, 'forbidden');
  const u = new URL(req.url);
  const thisYear = Number(toKstDate(new Date()).slice(0, 4));
  const year = Number(u.searchParams.get('y') ?? thisYear);
  if (!Number.isInteger(year) || year < 2000 || year > thisYear) return deny(400, 'invalid_input');
  const groups = await loadOrgGroups();
  const g = u.searchParams.get('g');
  const groupId = g && groups.some((x) => x.id === g) ? g : null;
  const e = u.searchParams.get('e');
  const employeeId = e && /^[0-9a-f-]{36}$/i.test(e) ? e : undefined;
  const practice = OFFICE.practiceMode && u.searchParams.get('live') !== '1';
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.annual' });
  const r = await buildAnnualReport({ year, practice, groupId: employeeId ? null : groupId, employeeId });
  if (employeeId && r.employees.length === 0) return deny(404, 'not_found');
  const who = employeeId ? `_${r.employees[0].name}` : '';
  const fileName = `${t('file')}_${year}${who}.xlsx`;
  const { error } = await createAdminClient().from('download_logs').insert({ actor_id: me.id, kind: 'attendance_annual_report', scope: employeeId ? `${year}:${employeeId}` : String(year), file_name: fileName });
  if (error) return deny(500, 'download_log_failed');
  const top = (id: string | null) => (id ? (groupPath(groups, id) ?? '') : t('unassigned'));
  const wb = annualWorkbook(r, { company: BRAND.name, by: me.name, groupName: groupId && !employeeId ? (groupPath(groups, groupId) ?? '') : t('all'), groupOf: top });
  return new Response((await wb.xlsx.writeBuffer()) as ArrayBuffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="annual-report_${year}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'cache-control': 'no-store',
      'x-request-id': randomUUID(),
    },
  });
}
