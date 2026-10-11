// 관리 › 근로정보 · 근무일정 유형 · 휴가 그룹 · 휴가 발생 규칙 · 승인 규칙 · 메시지 템플릿 · 메시지 자동화 규칙 — 시프티의 「관리」 메뉴에 있는 화면들 (2026-10-11 의뢰인 스샷
// `스샷/관리-근무일정-근무일정유형.png` · `관리-휴가-휴가그룹.png` · `관리-휴가-휴가발생규칙.png` · `관리-승인규칙*.png`).
// 지금은 앱에 정해져 있는 내용을 표로 보여 주는 화면이다(바꾸는 기능은 없다 — 화면 아래에 그렇게 적는다). 메시지 두 화면은 아직 없는 기능이라 빈 표에 그렇게 적는다.
import { Check } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PcTable, type PcCol, type PcRow } from '@/components/PcTable';
import { PageShell } from '@/components/ui';
import { loadActiveRule } from '@/lib/attendance-data';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { SHIFT_KINDS } from '@/lib/shifts';

const TOPICS = { 'shift-kinds': 'shiftKinds', 'leave-groups': 'leaveGroups', 'accrual-rule': 'accrualRule', 'approval-rules': 'approvalRules', 'work-info': 'workInfo', 'message-templates': 'messageTemplates', 'message-rules': 'messageRules' } as const;
const REQUEST_KINDS = ['punch', 'correction', 'overtime', 'shift', 'leave', 'leaveDelete', 'work'] as const;

export default async function ManageInfoPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!(topic in TOPICS)) notFound();
  const ns = TOPICS[topic as keyof typeof TOPICS];
  const [tm, tc, tk, tr, tl] = await Promise.all([getTranslations('admin.manage'), getTranslations('common'), getTranslations('admin.shifts.kinds'), getTranslations('requests'), getTranslations('leave')]);
  // 번역 묶음은 화면마다 따로 읽는다(묶음 이름을 글자 그대로 적어야 번역 누락 검사가 따라온다)
  const [ts, tg, ta, tp] = await Promise.all([getTranslations('admin.manage.shiftKinds'), getTranslations('admin.manage.leaveGroups'), getTranslations('admin.manage.accrualRule'), getTranslations('admin.manage.approvalRules')]);
  const [tw, tmt, tmr, f] = await Promise.all([getTranslations('admin.manage.workInfo'), getTranslations('admin.manage.messageTemplates'), getTranslations('admin.manage.messageRules'), getFormatter()]);
  const head =
    ns === 'shiftKinds' ? { title: ts('title'), intro: ts('intro') }
    : ns === 'leaveGroups' ? { title: tg('title'), intro: tg('intro') }
    : ns === 'accrualRule' ? { title: ta('title'), intro: ta('intro') }
    : ns === 'workInfo' ? { title: tw('title'), intro: tw('intro') }
    : ns === 'messageTemplates' ? { title: tmt('title'), intro: tmt('intro') }
    : ns === 'messageRules' ? { title: tmr('title'), intro: tmr('intro') }
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
          <Link href={link.href} className="inline-flex min-h-8 items-center rounded-button border border-nav bg-bg px-4 text-sm font-bold whitespace-nowrap text-nav">
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
