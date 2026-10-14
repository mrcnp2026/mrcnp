// 관리 › 근로정보 · 근무일정 유형 · 휴가 그룹 · 휴가 발생 규칙 · 승인 규칙 · 메시지 템플릿 · 메시지 자동화 규칙 — 시프티의 「관리」 메뉴에 있는 화면들 (2026-10-11 의뢰인 스샷
// `스샷/관리-근무일정-근무일정유형.png` · `관리-휴가-휴가그룹.png` · `관리-휴가-휴가발생규칙.png` · `관리-승인규칙*.png`).
// 지금은 앱에 정해져 있는 내용을 표로 보여 주는 화면이다(바꾸는 기능은 없다 — 화면 아래에 그렇게 적는다). 메시지 두 화면은 아직 없는 기능이라 빈 표에 그렇게 적는다.
import { Check } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PcTable, type PcCol, type PcRow } from '@/components/PcTable';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { loadActiveRule } from '@/lib/attendance-data';
import { loadConfirms } from '@/lib/confirm-data';
import { loadJobs } from '@/lib/job-data';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { SHIFT_KINDS } from '@/lib/shifts';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';

// 이어진 날짜를 「시작 ~ 끝」 묶음으로 (마감 관리의 「마감된 기간들」)
function dayRanges(days: string[]): string[] {
  const out: string[] = [];
  let a = '';
  let b = '';
  const next = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  for (const d of [...days].sort()) {
    if (a && d === next(b)) b = d;
    else {
      if (a) out.push(a === b ? a : `${a} ~ ${b}`);
      a = b = d;
    }
  }
  if (a) out.push(a === b ? a : `${a} ~ ${b}`);
  return out;
}

const TOPICS = { 'shift-kinds': 'shiftKinds', 'leave-groups': 'leaveGroups', 'accrual-rule': 'accrualRule', 'approval-rules': 'approvalRules', 'work-info': 'workInfo', 'message-templates': 'messageTemplates', 'message-rules': 'messageRules', 'schedule-patterns': 'schedulePatterns', 'report-templates': 'reportTemplates', 'report-snapshots': 'reportSnapshots', closing: 'closing' } as const;
const REQUEST_KINDS = ['punch', 'correction', 'overtime', 'shift', 'leave', 'leaveDelete', 'work'] as const;

export default async function ManageInfoPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (topic === 'closing') redirect('/admin/closing'); // 2026-10-13: 실제 마감 화면으로 옮겼다
  if (!(topic in TOPICS)) notFound();
  const ns = TOPICS[topic as keyof typeof TOPICS];
  const [tm, tc, tk, tr, tl] = await Promise.all([getTranslations('admin.manage'), getTranslations('common'), getTranslations('admin.shifts.kinds'), getTranslations('requests'), getTranslations('leave')]);
  // 번역 묶음은 화면마다 따로 읽는다(묶음 이름을 글자 그대로 적어야 번역 누락 검사가 따라온다)
  const [ts, tg, ta, tp] = await Promise.all([getTranslations('admin.manage.shiftKinds'), getTranslations('admin.manage.leaveGroups'), getTranslations('admin.manage.accrualRule'), getTranslations('admin.manage.approvalRules')]);
  const [tw, tmt, tmr, f] = await Promise.all([getTranslations('admin.manage.workInfo'), getTranslations('admin.manage.messageTemplates'), getTranslations('admin.manage.messageRules'), getFormatter()]);
  const [tsp, trt, trs, tcl] = await Promise.all([getTranslations('admin.manage.schedulePatterns'), getTranslations('admin.manage.reportTemplates'), getTranslations('admin.manage.reportSnapshots'), getTranslations('admin.manage.closing')]);
  const head =
    ns === 'shiftKinds' ? { title: ts('title'), intro: ts('intro') }
    : ns === 'leaveGroups' ? { title: tg('title'), intro: tg('intro') }
    : ns === 'accrualRule' ? { title: ta('title'), intro: ta('intro') }
    : ns === 'workInfo' ? { title: tw('title'), intro: tw('intro') }
    : ns === 'messageTemplates' ? { title: tmt('title'), intro: tmt('intro') }
    : ns === 'messageRules' ? { title: tmr('title'), intro: tmr('intro') }
    : ns === 'schedulePatterns' ? { title: tsp('title'), intro: tsp('intro') }
    : ns === 'reportTemplates' ? { title: trt('title'), intro: trt('intro') }
    : ns === 'reportSnapshots' ? { title: trs('title'), intro: trs('intro') }
    : ns === 'closing' ? { title: tcl('title'), intro: tcl('intro') }
    : { title: tp('title'), intro: tp('intro') };
  let empty = '';

  let cols: PcCol[] = [];
  let rows: PcRow[] = [];
  let link: { href: string; label: string } | null = null;
  let caution: string | null = null;
  if (ns === 'shiftKinds') {
    cols = [{ key: 'name', label: ts('colName') }, { key: 'deemed', label: ts('colDeemed'), align: 'center' }, { key: 'note', label: ts('colNote') }];
    rows = SHIFT_KINDS.filter((k) => k !== 'none').map((k) => ({
      id: k,
      cells: { name: { text: tk(k), node: <b>{tk(k)}</b> }, deemed: { text: ts(k === 'deemed' ? 'yes' : 'no'), node: k === 'deemed' ? <Check aria-label={ts('yes')} size={16} className="inline text-primary" /> : null }, note: { text: ts(`note.${k}`) } },
    }));
  } else if (ns === 'leaveGroups') {
    const types = (await loadAllLeaveTypes()).filter((x) => x.active);
    const names = [...new Set(types.map((x) => x.groupName ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    cols = [{ key: 'name', label: tg('colName') }, { key: 'count', label: tg('colCount'), align: 'right' }, { key: 'types', label: tg('colTypes') }];
    rows = names.map((g) => {
      const mine = types.filter((x) => (x.groupName ?? '') === g);
      return { id: g || '-', cells: { name: { text: g || tg('noGroup'), node: <b>{g || tg('noGroup')}</b> }, count: { text: String(mine.length) }, types: { text: mine.map((x) => leaveTypeName(types, x.code, tl)).join(' · ') } } };
    });
    link = { href: '/admin/leave/types', label: tg('toTypes') };
  } else if (ns === 'accrualRule') {
    cols = [{ key: 'who', label: ta('colWho'), search: false, sort: false }, { key: 'days', label: ta('colDays'), search: false, sort: false }, { key: 'note', label: ta('colNote'), search: false, sort: false }];
    rows = (['r1', 'r2', 'r3'] as const).map((r) => ({ id: r, cells: { who: { text: ta(r), node: <b>{ta(r)}</b> }, days: { text: ta(`${r}d`) }, note: { text: ta(`${r}n`) } } }));
    link = { href: '/admin/leave?v=accrual', label: ta('toAccrual') };
    caution = ta('caution');
  } else if (ns === 'workInfo') {
    const rule = await loadActiveRule();
    // 2024-01-01은 월요일 — 요일 이름(월…일)을 화면 언어로
    const wd = [...Array(7)].map((_, i) => f.dateTime(new Date(`2024-01-0${i + 1}T12:00:00+09:00`), { weekday: 'short' }));
    cols = [{ key: 'name', label: tw('colName') }, { key: 'wage', label: tw('colWage') }, { key: 'days', label: tw('colDays') }, { key: 'rest', label: tw('colRest') }, { key: 'hours', label: tw('colHours') }, { key: 'grace', label: tw('colGrace') }];
    rows = rule
      ? [{ id: 'base', cells: { name: { text: tw('baseName'), node: <b>{tw('baseName')}</b> }, wage: { text: tw('noWage') }, days: { text: rule.workdays.map((d) => wd[d - 1]).join(' · ') }, rest: { text: wd[rule.weeklyRestDay - 1] }, hours: { text: `${rule.startTime.slice(0, 5)} - ${rule.endTime.slice(0, 5)}` }, grace: { text: tw('minutes', { n: rule.lateGraceMin }) } } }]
      : [];
    empty = tw('none');
    link = { href: '/admin/settings?tab=work', label: tw('toSettings') };
    caution = tw('caution');
  } else if (ns === 'messageTemplates') {
    cols = [{ key: 'name', label: tmt('colName') }, { key: 'subject', label: tmt('colSubject') }, { key: 'note', label: tmt('colNote') }, { key: 'created', label: tmt('colCreated') }];
    empty = tmt('empty');
    link = { href: '/admin/notices', label: tmt('toNotices') };
  } else if (ns === 'messageRules') {
    cols = [{ key: 'name', label: tmr('colName') }, { key: 'kind', label: tmr('colKind') }, { key: 'start', label: tmr('colStart') }, { key: 'time', label: tmr('colTime') }];
    empty = tmr('empty');
    link = { href: '/admin/notices', label: tmr('toNotices') };
  } else if (ns === 'schedulePatterns') {
    // 시프티: 코드 · 패턴명 · 지점들 · 직무들 · 시작일자 · 총 일수 · 메모 (스샷 `스샷/스케줄 패턴.png`)
    cols = [{ key: 'code', label: tsp('colCode') }, { key: 'name', label: tsp('colName') }, { key: 'groups', label: tsp('colGroups') }, { key: 'jobs', label: tsp('colJobs') }, { key: 'start', label: tsp('colStart') }, { key: 'days', label: tsp('colDays') }, { key: 'memo', label: tsp('colMemo') }];
    empty = tsp('empty');
    link = { href: '/admin/shifts', label: tsp('toShifts') };
  } else if (ns === 'reportTemplates') {
    cols = [{ key: 'name', label: trt('colName') }, { key: 'items', label: trt('colItems') }, { key: 'groups', label: trt('colGroups') }, { key: 'jobs', label: trt('colJobs') }, { key: 'note', label: trt('colNote') }];
    empty = trt('empty');
    link = { href: '/admin/records', label: trt('toMonthly') };
  } else if (ns === 'reportSnapshots') {
    cols = [{ key: 'name', label: trs('colName') }, { key: 'items', label: trs('colItems') }, { key: 'people', label: trs('colPeople') }, { key: 'note', label: trs('colNote') }, { key: 'created', label: trs('colCreated') }];
    empty = trs('empty');
    link = { href: '/admin/records', label: trs('toMonthly') };
  } else if (ns === 'closing') {
    // 시프티 「마감 관리」: 이름 · 본지점 · 직무 · 마감된 기간들 (스샷 `스샷/마감 관리.png`). 우리 앱의 마감 = 날짜별 「기록 확정」 — 최근 석 달의 확정된 날을 이어진 기간으로 묶어 보인다
    const today = toKstDate(new Date());
    const from = `${new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 62 * 864e5).toISOString().slice(0, 7)}-01`;
    const [{ data: people }, groups, jobs, confirms] = await Promise.all([
      createAdminClient().from('profiles').select('id, name, employee_no, group_id, job_id').eq('active', true).order('name'),
      loadOrgGroups(),
      loadJobs(),
      loadConfirms(from, today, OFFICE.practiceMode),
    ]);
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    const daysOf = new Map<string, string[]>();
    for (const c of confirms.values()) daysOf.set(c.employeeId, [...(daysOf.get(c.employeeId) ?? []), c.workDate]);
    cols = [{ key: 'name', label: tcl('colName') }, { key: 'group', label: tcl('colGroup') }, { key: 'job', label: tcl('colJob') }, { key: 'days', label: tcl('colDays'), align: 'right' }, { key: 'closed', label: tcl('colClosed') }];
    rows = (people ?? [])
      .filter((p) => !p.employee_no?.startsWith('e2e-'))
      .map((p) => {
        const days = daysOf.get(p.id) ?? [];
        const ranges = dayRanges(days);
        return {
          id: p.id,
          cells: {
            name: { text: p.name, node: <Link href={`/admin/members/${p.id}`} className="font-bold hover:text-primary">{p.name}</Link> },
            group: { text: groupPath(groups, p.group_id) ?? '' },
            job: { text: (p.job_id && jobName.get(p.job_id)) || '' },
            days: { text: String(days.length) },
            closed: { text: ranges.join(', '), node: ranges.length ? <span className="num">{ranges.join(', ')}</span> : <span className="text-faint">{tcl('none')}</span> },
          },
        };
      });
    empty = tcl('empty');
    link = { href: '/admin/records/list', label: tcl('toRecords') };
    caution = tcl('caution');
  } else {
    cols = [{ key: 'kind', label: tp('colKind') }, { key: 'approver', label: tp('colApprover') }, { key: 'self', label: tp('colSelf') }, { key: 'effect', label: tp('colEffect') }];
    rows = REQUEST_KINDS.map((k) => ({ id: k, cells: { kind: { text: tr(`kinds.${k}`), node: <b>{tr(`kinds.${k}`)}</b> }, approver: { text: tp('approver') }, self: { text: tp('self') }, effect: { text: tp(`effect.${k}`) } } }));
  }

  return (
    <PageShell wide>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{head.title}</h1>
          <p className="pt-1 text-sm text-faint">{head.intro}</p>
        </div>
        {link && (
          <Link href={link.href} className="inline-flex min-h-8 items-center rounded-button border border-border bg-bg px-3.5 text-sm font-semibold whitespace-nowrap text-text hover:bg-surface">
            {link.label}
          </Link>
        )}
      </div>
      <PcTable cols={cols} rows={rows} labels={{ search: tc('colSearch'), empty }} />
      {caution && <p className="rounded-card bg-warn-tint p-3 text-sm text-warn">{caution}</p>}
      <p className="text-sm text-faint">{tm('readOnly')}</p>
    </PageShell>
  );
}
