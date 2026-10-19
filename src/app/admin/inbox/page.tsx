// ② 처리함 — 사람이 판단해야 하는 것을 한 받은함에 (마스터 5장): 연장근로 승인(7-7) · 정정 요청(7-10).
// 그날 근무노트를 연장 요청 옆에 보여 준다 (R-10-2의 8) — 사유로 자동 복사하지 않는다.
// 누가·언제 처리했는지 항상 보인다 (R-2의 5).
import { scopeFilter } from '@/lib/scope';
import { distanceText } from '@/lib/geo';
import { loadLocationsFor, loadOfficeLocations } from '@/lib/geo-data';
import { X } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pager, pageOf } from '@/components/Pager';
import { DetailBar } from '@/components/detail';
import { Help, HelpTip } from '@/components/Help';
import { PlaceMap } from '@/components/PlaceMap';
import { StatusCards } from '@/components/listframe';
import { RequestTabs } from '@/components/RequestTabs';
import { Card, Chip, PageShell } from '@/components/ui';
import { leaveBalanceFor } from '@/lib/leave-balance-data';
import { OFFICE } from '@/config/office';
import { resolveDayType } from '@/config/labor-rules';
import { getMe } from '@/lib/auth';
import { hiddenTestIds, pendingCounts } from '@/lib/period-data';
import { loadHolidays, loadRuleVersions } from '@/lib/attendance-data';
import { ruleAt } from '@/lib/rule-at';
import { loadStaff } from '@/lib/staff-data';
import { approvalBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import Link from 'next/link';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { loadRequests, REQUEST_WINDOW_DAYS } from '@/lib/request-data';
import { fromOvertime, splitRequests } from '@/lib/requests';
import { RequestRows } from '@/components/RequestRows';
import { HideRequests } from '@/components/HideRequests';
import { loadHidden, withoutHidden } from '@/lib/request-hides';
import { loadWorkRequests } from '@/lib/work-data';
import { ApproveDay, CorrectionDecision, LeaveDecision, OvertimeDecision, WorkDecision } from './Decisions';

// 요청은 종류마다 한 쪽에 5건까지 — 넘으면 아래에 쪽 번호 (2026-10-06 의뢰인)
const REQUEST_PAGE = 5;
// 대기중 · 완료 한 목록은 한 쪽에 10건 (2026-10-19 의뢰인: 많아지면 페이지 넘김, 폰 · PC 둘 다)
const LIST_PAGE = 10;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ live?: string; op?: string; cp?: string; lp?: string; wp?: string; tab?: string; dp?: string; q?: string; k?: string; id?: string; pp?: string; rk?: string }> }) {
  const t = await getTranslations('admin.inbox');
  const tr = await getTranslations('requests');
  const f = await getFormatter();
  const me = (await getMe())!;
  // 자기 요청은 다른 관리자가 처리한다 — 다른 관리자가 있을 때만 막는다 (staff-rules.ts)
  // 지점관리자는 자기 요청을 처리하지 못한다 — 관리자가 한다
  // 등급별 승인 규칙 (개발-39): 처리할 수 없는 사람의 요청은 단추 대신 안내 — 본인 것 · 상위 등급 것
  const staffAll = await loadStaff();
  const actorStaff = staffAll.find((x) => x.id === me.id);
  const cannot = (id: string) => {
    const target = staffAll.find((x) => x.id === id);
    return !actorStaff || !target ? false : !!approvalBlocked(actorStaff, target, staffAll);
  };
  const ownNote = <p className="text-sm text-muted">{t('selfBlocked')}</p>;
  const rankNote = <p className="text-sm text-muted">{t('rankBlocked')}</p>;
  const sp = await searchParams;
// ★ 연습 모드에서는 모든 기록이 연습 기록이다 — 관리자 화면도 기본으로 연습 기록을 본다 (2026-10-02: 시험직원 정정 요청이 관리자에게 0건으로 보이던 문제). ?live=1이면 실제 기록
  const practice = OFFICE.practiceMode && sp.live !== '1';
  if (sp.tab === 'done') return <DoneTab sp={sp} practice={practice} />;
  const today = toKstDate(new Date());
  // 연장근로 확인은 여기서 만들지 않는다 — 기록이 바뀔 때 바로(syncOvertimeFor) + 새벽 정기 작업이 맞춘다 (2026-10-19 속도).
  // 31일치 전 직원 기록도 읽지 않는다 — 쓰던 것은 한 건 보기의 그날 근무규칙 · 공휴일뿐이라 그것만 읽는다(아래 dayPreview)

  const db = createAdminClient();
  const [{ data: otAll }, { data: coAll }, { data: staff }] = await Promise.all([
    db.from('overtime_requests').select('*').eq('is_test', practice).or('status.eq.pending,needs_review.eq.true').order('work_date'),
    db.from('punch_corrections').select('*').eq('is_test', practice).eq('status', 'pending').order('created_at'),
    db.from('profiles').select('id, name, employee_no'),
  ]);
  const name = new Map((staff ?? []).map((p) => [p.id, p.name]));
  // 이름 검색 (?q) — 모든 종류의 대기 요청에 같이 적용한다
  const q = (sp.q ?? '').trim().slice(0, 40).toLowerCase();
  const hidden = new Set(await hiddenTestIds()); // 꺼져 있는 검사 전용 계정의 요청은 보이지 않는다
  const inScope = await scopeFilter(); // 지점관리자면 맡은 지점 직원의 요청만 (아래에서 표를 직접 읽는 것들을 여기서 거른다)
  const hit = (id: string) => inScope(id) && !hidden.has(id) && (!q || (name.get(id) ?? '').toLowerCase().includes(q));
  // 한 건만 보기 (2026-10-11 의뢰인: 시프티처럼 대기중은 한 목록, 줄을 누르면 그 요청 하나를 처리하는 화면) — ?k=종류&id=요청
  const FOCUS_KINDS = ['punch', 'shift', 'leaveDelete', 'overtime', 'corrections', 'leave', 'work'] as const;
  type FocusKind = (typeof FOCUS_KINDS)[number];
  const focus = (FOCUS_KINDS as readonly string[]).includes(sp.k ?? '') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.id ?? '') ? { k: sp.k as FocusKind, id: sp.id as string } : null;
  // 같은 사람 · 같은 날의 출근/퇴근 요청 · 정정 · 연장근로는 한 화면에 모아 한 번에 승인한다 (2026-10-18 의뢰인: 셋을 따로 누르면 불편하다)
  const DAY_KINDS: readonly FocusKind[] = ['punch', 'corrections', 'overtime'];
  const focusDay: { employee_id: string; work_date: string } | null = !focus || !DAY_KINDS.includes(focus.k)
    ? null
    : focus.k === 'overtime' ? ((otAll ?? []).find((o) => o.id === focus.id) ?? null)
    : focus.k === 'corrections' ? ((coAll ?? []).find((c) => c.id === focus.id) ?? null)
    : ((await db.from('punch_requests').select('employee_id, work_date').eq('id', focus.id).maybeSingle()).data ?? null);
  const only = (k: FocusKind, id: string, day?: { e: string; d: string }) =>
    !focus || (focus.k === k && focus.id === id) || (!!day && !!focusDay && DAY_KINDS.includes(k) && focusDay.employee_id === day.e && focusDay.work_date === day.d);
  const ot = (otAll ?? []).filter((o) => hit(o.employee_id) && only('overtime', o.id, { e: o.employee_id, d: o.work_date }));
  const co = (coAll ?? []).filter((c) => hit(c.employee_id) && only('corrections', c.id, { e: c.employee_id, d: c.work_date }));
  const keys = [...(ot ?? []).map((o) => [o.employee_id, o.work_date]), ...(co ?? []).map((c) => [c.employee_id, c.work_date])];
  const empIds = [...new Set(keys.map((k) => k[0]))];
  const dates = [...new Set(keys.map((k) => k[1]))];
  const [{ data: notes }, { data: evs }] = await Promise.all([
    empIds.length
      ? db.from('work_notes').select('employee_id, work_date, body, created_at').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { employee_id: string; work_date: string; body: string }[] }),
    empIds.length
      ? db.from('punch_events').select('id, employee_id, work_date, kind, punched_at, verified_by, source, location_id, geo_lat, geo_lng').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('punched_at')
      : Promise.resolve({ data: [] as { id: string; employee_id: string; work_date: string; kind: string; punched_at: string; verified_by: string | null; source: string; location_id: string | null; geo_lat: number | null; geo_lng: number | null }[] }),
  ]);
  const noteOf = (e: string, d: string) => notes?.find((n) => n.employee_id === e && n.work_date === d)?.body ?? null;
  const hm = (iso: string | null) => (iso ? f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const dayLabel = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });
  const punchesOf = (e: string, d: string) =>
    (evs ?? []).filter((x) => x.employee_id === e && x.work_date === d).map((x) => `${x.kind === 'in' ? '↘' : '↗'} ${hm(x.punched_at)}`).join('  ');
  // 연장근로 상세의 출퇴근 위치 (2026-10-18 의뢰인: 연장근로 요청에 퇴근 위치가 안 나온다) — 연장근로는 직원이 쓰는 요청이 아니라
  // 출퇴근 기록에서 저절로 생기므로, 그날 출근 · 퇴근을 어디서 어떻게 확인했는지를 보여 준다. 한 건 보기에서만 장소를 읽는다
  const placeOf = new Map(focus?.k === 'overtime' ? (await loadOfficeLocations(true)).map((l) => [l.id, l]) : []);
  const wherePunched = (e: string, d: string) => {
    const day = (evs ?? []).filter((x) => x.employee_id === e && x.work_date === d);
    if (day.length === 0) return null;
    const how = (x: (typeof day)[number]) => {
      const place = x.location_id ? placeOf.get(x.location_id)?.label : null;
      if (x.verified_by === 'gps') return place ? t('whereGpsAt', { name: place }) : t('whereGps');
      if (x.verified_by === 'ip') return t('whereIp');
      if (x.source === 'admin') return t('whereAdmin');
      if (x.source === 'import') return t('whereImport');
      return t('whereNone');
    };
    const lastOut = [...day].reverse().find((x) => x.kind === 'out');
    const pin = lastOut && lastOut.geo_lat !== null && lastOut.geo_lng !== null ? { lat: Number(lastOut.geo_lat), lng: Number(lastOut.geo_lng), r: 0 } : null;
    const base = !pin && lastOut?.location_id ? placeOf.get(lastOut.location_id) : null;
    const labels = { zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('mapOut') };
    return (
      <div className="flex flex-col gap-1.5" data-overtime-where>
        <p className="text-xs font-semibold text-muted">{t('whereTitle')}</p>
        <ul className="num flex flex-col gap-0.5 text-sm">
          {day.map((x) => (
            <li key={x.id}>
              {x.kind === 'in' ? '↘' : '↗'} {hm(x.punched_at)} {t(x.kind === 'in' ? 'whereIn' : 'whereOut')} · <span className="text-muted">{how(x)}</span>
            </li>
          ))}
        </ul>
        {pin && <PlaceMap lat={pin.lat} lng={pin.lng} radiusM={0} labels={labels} />}
        {base && <PlaceMap lat={base.lat} lng={base.lng} radiusM={base.radiusM} labels={labels} />}
      </div>
    );
  };

  const { data: punchRows } = await db.from('punch_requests').select(OFFICE.requestLocation ? 'id, employee_id, kind, requested_at, work_date, nearest_m, geo_reason, lat, lng' : 'id, employee_id, kind, requested_at, work_date, nearest_m, geo_reason').eq('is_test', practice).eq('status', 'pending').order('requested_at');
  const punchPending = ((punchRows ?? []) as unknown as { id: string; employee_id: string; kind: 'in' | 'out'; requested_at: string; work_date: string; nearest_m: number | null; geo_reason: string; lat?: number | null; lng?: number | null }[]).filter((r) => hit(r.employee_id) && only('punch', r.id, { e: r.employee_id, d: r.work_date }));
  // 요청한 사람에게 적용되는 출퇴근 장소(우측 패널 지도용) — 한 건 보기에서만 읽는다
  const baseOf = new Map<string, Awaited<ReturnType<typeof loadLocationsFor>>[number]>();
  if (focus) for (const id of new Set(punchPending.map((r) => r.employee_id))) {
    const locs = (await loadLocationsFor(id)).filter((l) => l.active);
    if (locs[0]) baseOf.set(id, locs[0]);
  }
  const { data: shiftRows } = await db.from('shift_requests').select('id, employee_id, work_date, start_time, end_time, kind, reason').eq('is_test', practice).eq('status', 'pending').order('work_date');
  const shiftPending = ((shiftRows ?? []) as { id: string; employee_id: string; work_date: string; start_time: string; end_time: string; kind: string; reason: string | null }[]).filter((r) => hit(r.employee_id) && only('shift', r.id));
  const { data: delRows } = await db.from('leave_change_requests').select('id, employee_id, reason, leave_requests(type_code, start_date, end_date, days, start_time, end_time)').eq('is_test', practice).eq('status', 'pending').order('created_at');
  const delPending = ((delRows ?? []) as unknown as { id: string; employee_id: string; reason: string | null; leave_requests: { type_code: string; start_date: string; end_date: string; days: number; start_time: string | null; end_time: string | null } | null }[]).filter((r) => hit(r.employee_id) && r.leave_requests && only('leaveDelete', r.id));
  const tc = await getTranslations('common');
  const otPage = pageOf(ot ?? [], sp.op, REQUEST_PAGE);
  const coPage = pageOf(co ?? [], sp.cp, REQUEST_PAGE);

  // 연차·휴가 신청 (②-2 게이트 5): 남은 연차 + 그 날짜 출근 기록 충돌 경고 (자동으로 지우지 않는다, 요점 4)
  const tl = await getTranslations('leave');
  const [leaveTypes, leavePending] = await Promise.all([loadAllLeaveTypes(), loadLeaveRequests({ practice }).then((rs) => rs.filter((r) => r.status === 'pending' && hit(r.employeeId) && only('leave', r.id)))]);
  const leaveEmp = [...new Set(leavePending.map((r) => r.employeeId))];
  const [leaveGrants, leaveAll, { data: leavePunches }] = await Promise.all([
    Promise.all(leaveEmp.map((e) => loadLeaveGrants(e))).then((x) => x.flat()),
    Promise.all(leaveEmp.map((e) => loadLeaveRequests({ employeeId: e, practice }))).then((x) => x.flat()),
    leaveEmp.length
      ? db.from('punch_events').select('employee_id, work_date').in('employee_id', leaveEmp).eq('is_test', practice)
          .gte('work_date', leavePending.reduce((a, r) => (r.startDate < a ? r.startDate : a), '9999-12-31'))
          .lte('work_date', leavePending.reduce((a, r) => (r.endDate > a ? r.endDate : a), '0000-01-01'))
      : Promise.resolve({ data: [] as { employee_id: string; work_date: string }[] }),
  ]);
  const leaveName = (code: string) => leaveTypeName(leaveTypes, code, tl);
  const nDays = (v: number) => f.number(v, { maximumFractionDigits: 4 });
  const lvPage = pageOf(leavePending, sp.lp, REQUEST_PAGE);
  const workPending = (await loadWorkRequests({ practice })).filter((w) => w.status === 'pending' && hit(w.employeeId) && only('work', w.id)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const wkPage = pageOf(workPending, sp.wp, REQUEST_PAGE);

  // 상세(폰 화면 · PC 오른쪽 패널)의 카드가 쓰는 값
  const lvRows = await Promise.all(lvPage.items.map(async (r) => {
    const bal = await leaveBalanceFor({ employeeId: r.employeeId, practice, grants: leaveGrants.filter((g) => g.employeeId === r.employeeId), requests: leaveAll.filter((x) => x.employeeId === r.employeeId), types: leaveTypes, asOf: r.startDate });
    const deducts = leaveTypes.find((x) => x.code === r.typeCode)?.deductsBalance;
    const clash = [...new Set((leavePunches ?? []).filter((p) => p.employee_id === r.employeeId && p.work_date >= r.startDate && p.work_date <= r.endDate).map((p) => p.work_date))];
    const range = r.startDate === r.endDate ? `${dayLabel(r.startDate)}${r.startTime ? ` ${r.startTime}-${r.endTime}` : ''}` : `${dayLabel(r.startDate)} ~ ${dayLabel(r.endDate)}`;
    const summary = `${leaveName(r.typeCode)} ${tl('days', { n: nDays(r.days) })} (${range})`;
    const balance = deducts ? (bal.grant || bal.ledger ? t('leaveBalance', { remaining: nDays(bal.remaining), pending: nDays(bal.pending) }) : t('leaveNoGrant')) : null;
    return { r, clash, range, summary, balance };
  }));
  const wkRows = wkPage.items.map((w) => {
    const range = w.startDate === w.endDate ? dayLabel(w.startDate) : `${dayLabel(w.startDate)} ~ ${dayLabel(w.endDate)}`;
    return { w, when: `${range}${w.startTime ? ` ${w.startTime}~${w.endTime}` : ''}` };
  });
  const coRows = coPage.items.map((c) => {
    const target = c.target_id ? evs?.find((e) => e.id === c.target_id) : null;
    const line =
      c.correction_type === 'add_missing'
        ? t('addMissingLine', { kind: t(`kind.${c.kind}`), time: hm(c.new_punched_at) })
        : c.correction_type === 'modify'
          ? t('modifyLine', { from: hm(target?.punched_at ?? null), to: hm(c.new_punched_at) })
          : t('voidLine', { time: hm(target?.punched_at ?? null) });
    return { c, line };
  });
  // 폰의 한 목록: 대기 중인 요청 전부 + 다시 확인할 연장근로(상태는 처리됨이지만 재확인 필요)
  const listed = [
    ...splitRequests((await loadRequests({ practice })).filter((x) => hit(x.employeeId))).pending,
    ...(otAll ?? []).filter((o) => hit(o.employee_id) && o.status !== 'pending').map((o) => ({ ...fromOvertime(o), status: 'pending' as const })),
  ];
  // 종류 카드로 거르기 (목록 틀 — components/listframe). ?rk= 는 한 건 보기(?k=)와 겹치지 않는 이름
  const RKINDS = ['punch', 'correction', 'overtime', 'shift', 'leave', 'leaveDelete', 'work'] as const;
  const rk = (RKINDS as readonly string[]).includes(sp.rk ?? '') ? (sp.rk as string) : null;
  const rkLink = (k: string | null) => `/admin/inbox?${[k ? `rk=${k}` : '', sp.live === '1' ? 'live=1' : '', q ? `q=${encodeURIComponent(q)}` : ''].filter(Boolean).join('&')}`;
  const shownList = rk ? listed.filter((x) => x.kind === rk) : listed;
  const listPage = pageOf(shownList, sp.pp, LIST_PAGE);
  const focusHref = (r: { kind: string; id: string }) => `/admin/inbox?k=${r.kind === 'correction' ? 'corrections' : r.kind}&id=${r.id}${sp.live === '1' ? '&live=1' : ''}`;
  // 한 번에 승인할 것 — 출퇴근 요청 · 정정을 먼저 승인하고 연장근로는 그 뒤(출퇴근이 바뀌면 연장근로가 다시 계산된다). 자기 요청 · 상위 등급 요청은 뺀다
  const dayBatch = !focusDay || cannot(focusDay.employee_id)
    ? []
    : [
        ...punchPending.map((r) => ({ url: `/api/admin/punch-requests/${r.id}/decide`, body: { decision: 'approved' } })),
        ...co.map((c) => ({ url: `/api/admin/corrections/${c.id}/decide`, body: { decision: 'approved' } })),
        ...ot.filter((o) => o.status === 'pending').map((o) => ({ url: `/api/admin/overtime/${o.id}/decide`, body: { decision: 'approved', approvedMinutes: null, approvedNightMinutes: null, approvedHolidayMinutes: null } })),
      ];
  // 출근 · 퇴근 요청만 있는 날: 요청한 시각으로 대략의 근무 시간 · 휴일 여부를 미리 보인다(정확한 연장 · 야간 · 휴일 구분은 승인 뒤 앱이 계산)
  // 직원이 출근 · 퇴근 때 남긴 사유(근무노트) — 하루 카드에 같이 보인다 (2026-10-18 의뢰인: 관리자가 따로 묻지 않게)
  const dayNote = focusDay
    ? (((await db.from('work_notes').select('body').eq('employee_id', focusDay.employee_id).eq('work_date', focusDay.work_date).eq('is_test', practice).order('created_at', { ascending: false }).limit(1)).data?.[0]?.body as string | undefined) ?? null)
    : null;
  const dayRule = focusDay ? (ruleAt(await loadRuleVersions(), focusDay.work_date) ?? ruleAt(await loadRuleVersions(), today)) : null;
  const dayHolidays = focusDay ? await loadHolidays(focusDay.work_date, focusDay.work_date) : [];
  const dayPreview = (() => {
    if (!focusDay || punchPending.length === 0) return null;
    const pin = punchPending.find((r) => r.kind === 'in');
    const pout = punchPending.find((r) => r.kind === 'out');
    const off = dayRule ? resolveDayType(focusDay.work_date, dayRule, dayHolidays) !== 'workday' : false;
    const span = pin && pout ? Math.max(0, Math.round((Date.parse(pout.requested_at) - Date.parse(pin.requested_at)) / 60000)) : null;
    return t(off ? 'dayPreviewOff' : 'dayPreview', { from: pin ? hm(pin.requested_at) : '—', to: pout ? hm(pout.requested_at) : '—', min: span ?? 0, known: span === null ? 'no' : 'yes' });
  })();
  const focusCount = focus ? ot.length + co.length + leavePending.length + workPending.length + punchPending.length + shiftPending.length + delPending.length : 0;
  const empty = <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>;
  const hint = (text: string) => (
    <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
      {t('tabHelp')}
      <Help>{text}</Help>
    </div>
  );

  // 요청을 쓴 순간의 위치 (외근 · 정정, 결정 출퇴근-9 · DB 0055) — 한 건 보기에서만. 못 받았으면 「위치 없음」
  const sentFrom = (lat: unknown, lng: unknown) =>
    !focus || !OFFICE.requestLocation ? null : typeof lat === 'number' && typeof lng === 'number' ? (
      <div className="flex flex-col gap-1.5" data-request-where>
        <p className="text-xs font-semibold text-muted">{t('sentFrom')}</p>
        <PlaceMap lat={lat} lng={lng} radiusM={0} labels={{ zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') }} />
        <p className="rounded-button bg-surface p-2 text-xs text-muted">{t('mapShared')}</p>
      </div>
    ) : (
      <p className="rounded-button bg-surface p-2 text-xs text-muted" data-request-where>{t('mapNone')}</p>
    );

  const overtimeTab = (
    <>
      {hint(t('overtimeHint'))}
      {(ot ?? []).length === 0 && empty}
      <div className="flex flex-col gap-3">
        {otPage.items.map((o) => (
          <Card key={o.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name.get(o.employee_id)}</p>
                <p className="num text-sm text-muted">{[dayLabel(o.work_date), punchesOf(o.employee_id, o.work_date)].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {o.needs_review && <Chip tone="warn">{t('needsReview')}</Chip>}
                {o.employee_id === me.id && <Chip>{t('self')}</Chip>}
              </div>
            </div>
            <dl className="num grid grid-cols-3 gap-2 text-center">
              {(['overtime', 'night', 'holiday'] as const).map((k) => (
                <div key={k} className="rounded-button bg-surface p-2">
                  <dt className="text-xs text-muted">{t(k)}</dt>
                  <dd className="text-xl font-semibold">{t('min', { n: o[`${k}_minutes`] })}</dd>
                  {o.needs_review && o[`recomputed_${k}_minutes`] !== null && (
                    <dd className="text-xs text-warn">{t('nowCounted', { n: o[`recomputed_${k}_minutes`] })}</dd>
                  )}
                </div>
              ))}
            </dl>
            {o.reason && <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{o.reason}</p>}
            {focus && wherePunched(o.employee_id, o.work_date)}
            {noteOf(o.employee_id, o.work_date) && (
              <p className="rounded-button bg-surface p-2 text-sm">
                <span className="block text-xs text-muted">{t('note')}</span>
                <span className="whitespace-pre-wrap break-words">{noteOf(o.employee_id, o.work_date)}</span>
              </p>
            )}
            {o.status !== 'pending' && (
              <p className="text-xs text-muted">{t('decidedBy', { status: t(`status.${o.status}`), who: name.get(o.approved_by) ?? '—' })}</p>
            )}
            {cannot(o.employee_id) ? (o.employee_id === me.id ? ownNote : rankNote) : <OvertimeDecision id={o.id} name={name.get(o.employee_id) ?? ''} facts={{ overtime: o.overtime_minutes, night: o.night_minutes, holiday: o.holiday_minutes }} />}
          </Card>
        ))}
      </div>
      <Pager page={otPage.page} pages={otPage.pages} param="op" params={sp} anchor="overtime" label={tc('pages')} />
    </>
  );

  const correctionsTab = (
    <>
      {(co ?? []).length === 0 && empty}
      <div className="flex flex-col gap-3">
        {coRows.map(({ c, line }) => (
          <Card key={c.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name.get(c.employee_id)}</p>
                <p className="num text-sm text-muted">{dayLabel(c.work_date)} · {t(`type.${c.correction_type}`)}</p>
              </div>
              {c.employee_id === me.id && <Chip>{t('self')}</Chip>}
            </div>
            <p className="num">{line}</p>
            <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{c.reason}</p>
            {sentFrom(c.lat, c.lng)}
            {cannot(c.employee_id) ? (c.employee_id === me.id ? ownNote : rankNote) : <CorrectionDecision id={c.id} name={name.get(c.employee_id) ?? ''} />}
          </Card>
        ))}
      </div>
      <Pager page={coPage.page} pages={coPage.pages} param="cp" params={sp} anchor="corrections" label={tc('pages')} />
    </>
  );

  const leaveTab = (
    <>
      {leavePending.length === 0 && empty}
      <div className="flex flex-col gap-3">
        {lvRows.map(({ r, clash, range, summary, balance }) => (
          <Card key={r.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name.get(r.employeeId)}</p>
                <p className="num text-sm text-muted">{range}</p>
              </div>
              {r.employeeId === me.id && <Chip>{t('self')}</Chip>}
            </div>
            <p className="num font-semibold">
              {leaveName(r.typeCode)} · {tl('days', { n: nDays(r.days) })}
            </p>
            {balance && <p className="num text-sm text-muted">{balance}</p>}
            {r.reason && <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{r.reason}</p>}
            {clash.length > 0 && (
              <p className="rounded-button border border-warn bg-warn-tint p-2 text-sm text-warn">{t('leaveClash', { dates: clash.map(dayLabel).join(', ') })}</p>
            )}
            {cannot(r.employeeId) ? (r.employeeId === me.id ? ownNote : rankNote) : <LeaveDecision id={r.id} name={name.get(r.employeeId) ?? ''} summary={summary} />}
          </Card>
        ))}
      </div>
      <Pager page={lvPage.page} pages={lvPage.pages} param="lp" params={sp} anchor="leave" label={tc('pages')} />
      <Link href="/admin/leave" className="inline-flex min-h-11 items-center self-start text-sm text-primary">
        {t('leaveManage')} ›
      </Link>
    </>
  );

  const workTab = (
    <>
      {hint(t('workClashHint'))}
      {workPending.length === 0 && empty}
      <div className="flex flex-col gap-3">
        {wkRows.map(({ w, when }) => (
          <Card key={w.id} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{name.get(w.employeeId)}</p>
                <p className="num text-sm text-muted">{when}</p>
              </div>
              {w.employeeId === me.id && <Chip>{t('self')}</Chip>}
            </div>
            <p className="font-semibold">
              {t(`workKind.${w.kind}`)} · <span className="font-normal">{t('place')}: {w.place}</span>
            </p>
            {w.reason && <p className="text-sm"><span className="text-muted">{t('reason')}: </span>{w.reason}</p>}
            {sentFrom(w.lat, w.lng)}
            {cannot(w.employeeId) ? (w.employeeId === me.id ? ownNote : rankNote) : <WorkDecision id={w.id} name={name.get(w.employeeId) ?? ''} summary={`${t(`workKind.${w.kind}`)} (${when})`} />}
          </Card>
        ))}
      </div>
      <Pager page={wkPage.page} pages={wkPage.pages} param="wp" params={sp} anchor="work" label={tc('pages')} />
    </>
  );

  const listHref = `/admin/inbox${sp.live === '1' ? '?live=1' : ''}`;
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const gone = (
    <p className="rounded-card bg-surface p-5 text-sm text-muted">
      {t('focusGone')}{' '}
      <Link href={listHref} className="font-bold text-primary">
        {t('backToList')} ›
      </Link>
    </p>
  );

  return (
    <PageShell wide>
      {/* 폰: 한 건 보기는 그 요청만의 화면 */}
      {focus && (
        <div className="flex flex-col gap-3 lg:hidden">
          <DetailBar back={listHref} backLabel={t('backToList')} title={t('focusTitle')} />
          {focusCount === 0 && gone}
        </div>
      )}
      {/* 목록 — 폰: 한 건 보기 중에는 숨긴다 · PC: 언제나 보이고 한 건 보기는 오른쪽 패널로 뜬다 (2026-10-11 의뢰인 스샷 `스샷/요청 내역*.png`) */}
      <div className={focus ? 'hidden lg:contents' : 'contents'}>
        <h1 className="sr-only lg:hidden">{t('title')}</h1>
        <div className="hidden items-start gap-4 lg:flex">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">{t('pcTitle')}<HelpTip>{t('pcIntro')}</HelpTip></h1>
          </div>
          <p className="num pt-2 text-sm text-muted">
            {t('totalCount')} <b className="text-lg text-text">{listed.length}</b>
          </p>
        </div>
        <RequestTabs admin active="pending" live={sp.live === '1'} q={q} counts={{ pending: listed.length }} />
        {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
        {listed.length > 0 && (
          <div className="hidden lg:block">
            <StatusCards groups={[{ title: t('cardsKind'), cards: RKINDS.map((k) => ({ key: k, label: tr(`kinds.${k}`), n: listed.filter((x) => x.kind === k).length, unit: t('unit'), href: rkLink(rk === k ? null : k), on: rk === k, tone: 'warn' as const })) }]} />
          </div>
        )}
        {listed.length === 0 && empty}
        <div className="flex flex-col gap-3 lg:hidden">
          <RequestRows items={listPage.items} leaveTypes={leaveTypes} names={names} showName hrefOf={focusHref} />
        </div>
        {listPage.items.length > 0 && (
          <div className="hidden lg:block">
            <RequestRows table items={listPage.items} leaveTypes={leaveTypes} names={names} showName hrefOf={focusHref} />
          </div>
        )}
        <Pager page={listPage.page} pages={listPage.pages} param="pp" params={sp} label={tc('pages')} />
      </div>
      {/* 한 건 보기 — 폰: 본문 그대로 · PC: 화면 오른쪽에서 밀려 나오는 상세 패널(시프티의 요청 상세) */}
      {focus && (
      <div className="panel-in contents lg:fixed lg:top-14 lg:right-0 lg:bottom-0 lg:z-30 lg:flex lg:w-136 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:border-l lg:border-border lg:bg-bg lg:p-6 lg:shadow-card">
        <div className="hidden items-center justify-between lg:flex">
          <h2 className="text-lg font-bold">{t('focusTitle')}</h2>
          <Link href={listHref} aria-label={t('panelClose')} className="flex size-8 items-center justify-center rounded-button text-muted hover:bg-surface">
            <X aria-hidden size={18} />
          </Link>
        </div>
        {focusCount === 0 && <div className="hidden lg:block">{gone}</div>}
        {(dayBatch.length > 1 || (dayBatch.length > 0 && punchPending.length > 0)) && (
          <ApproveDay
            name={name.get(focusDay!.employee_id) ?? ''}
            day={dayLabel(focusDay!.work_date)}
            count={dayBatch.length}
            items={dayBatch}
            punchFirst={punchPending.length > 0}
            employeeId={focusDay!.employee_id}
            workDate={focusDay!.work_date}
            preview={dayPreview}
            note={dayNote}
          />
        )}
      {/* 반경 밖 출근/퇴근 요청 (2026-10-10 의뢰인: 시프티 방식) — 승인해야 기록이 되므로 맨 위에 둔다 */}
      {punchPending.length > 0 && (
        <section id="punch" className="flex scroll-mt-16 flex-col gap-2">
          <h2 className="px-1 font-bold">
            {t('punchTitle')} <span className="num text-warn">{punchPending.length}</span>
          </h2>
          <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
            {punchPending.map((r) => {
              const who = name.get(r.employee_id) ?? '';
              const what = `${dayLabel(r.work_date)} ${hm(r.requested_at)} ${t(`kind.${r.kind}`)}`;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-bold">
                      {t(r.kind === 'in' ? 'punchIn' : 'punchOut')} · {who}
                    </span>
                    <span className="num text-sm">{dayLabel(r.work_date)} {hm(r.requested_at)}</span>
                  </div>
                  <p className="num text-sm text-muted">{r.geo_reason === 'outside' && r.nearest_m !== null ? t('punchFar', { m: distanceText(r.nearest_m) }) : t(`punchWhy.${r.geo_reason}`)}</p>
                  {/* 요청한 위치 지도 — 한 건 보기(상세)에서만, 위치를 남기는 설정이 켜져 있을 때만 */}
                  {focus && OFFICE.requestLocation &&
                    (typeof r.lat === 'number' && typeof r.lng === 'number' ? (
                      <>
                        <PlaceMap lat={r.lat} lng={r.lng} radiusM={0} labels={{ zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') }} />
                        <p className="rounded-button bg-surface p-2 text-xs text-muted">{t('mapShared')}</p>
                      </>
                    ) : (
                      <p className="rounded-button bg-surface p-2 text-xs text-muted">{t('mapNone')}</p>
                    ))}
                  {/* 기준 출퇴근 장소 지도 (2026-10-15 의뢰인: 우측 패널에 지도가 없다) — 요청한 사람의 위치가 없는 요청(위치를 못 받았거나 저장 전에 낸 요청)이면 기준 장소와 거리만 보인다 */}
                  {focus && !(OFFICE.requestLocation && typeof r.lat === 'number') && baseOf.get(r.employee_id) && (() => {
                    const b = baseOf.get(r.employee_id)!;
                    return (
                      <div className="flex flex-col gap-1.5" data-base-map>
                        <p className="text-xs font-semibold text-muted">{t('mapBase', { name: b.label ?? '', r: b.radiusM })}</p>
                        <PlaceMap lat={b.lat} lng={b.lng} radiusM={b.radiusM} labels={{ zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') }} />
                        <p className="text-xs text-faint">{t('mapNoPoint')}</p>
                      </div>
                    );
                  })()}
                  {cannot(r.employee_id) ? (r.employee_id === me.id ? ownNote : rankNote) : <LeaveDecision id={r.id} name={who} summary={what} url={`/api/admin/punch-requests/${r.id}/decide`} keys={['confirmPunch', 'confirmPunchReject']} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 근무일정 생성 요청 (2026-10-11 의뢰인: 시프티의 근무일정 요청) — 승인하면 그 날짜에 일정이 만들어진다 */}
      {shiftPending.length > 0 && (
        <section id="shift" className="flex scroll-mt-16 flex-col gap-2">
          <h2 className="px-1 font-bold">
            {t('shiftTitle')} <span className="num text-warn">{shiftPending.length}</span>
          </h2>
          <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
            {shiftPending.map((r) => {
              const who = name.get(r.employee_id) ?? '';
              const what = `${dayLabel(r.work_date)} ${r.start_time.slice(0, 5)} - ${r.end_time.slice(0, 5)}`;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-bold">
                      {t('shiftOne')} · {who}
                    </span>
                    <span className="num text-sm">{what}</span>
                  </div>
                  {r.reason && <p className="text-sm text-muted">{r.reason}</p>}
                  {cannot(r.employee_id) ? (r.employee_id === me.id ? ownNote : rankNote) : <LeaveDecision id={r.id} name={who} summary={what} url={`/api/admin/schedule-requests/${r.id}/decide`} keys={['confirmShift', 'confirmShiftReject']} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 휴가 삭제 요청 (2026-10-11 의뢰인: 시프티의 휴가 삭제) — 승인하면 그 휴가가 취소되고 잔여가 돌아온다 */}
      {delPending.length > 0 && (
        <section id="leave-delete" className="flex scroll-mt-16 flex-col gap-2">
          <h2 className="px-1 font-bold">
            {t('leaveDeleteTitle')} <span className="num text-warn">{delPending.length}</span>
          </h2>
          <ul className="-mx-4 divide-y divide-border border-y border-border bg-bg lg:mx-0 lg:rounded-card lg:border">
            {delPending.map((r) => {
              const lv = r.leave_requests!;
              const who = name.get(r.employee_id) ?? '';
              const what = `${leaveName(lv.type_code)} ${tl('days', { n: nDays(Number(lv.days)) })} (${lv.start_date === lv.end_date ? dayLabel(lv.start_date) : `${dayLabel(lv.start_date)} ~ ${dayLabel(lv.end_date)}`})`;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-5 py-3">
                  <span className="font-bold">
                    {t('leaveDeleteOne')} · {who}
                  </span>
                  <p className="num text-sm">{what}</p>
                  {r.reason && <p className="text-sm text-muted">{r.reason}</p>}
                  {cannot(r.employee_id) ? (r.employee_id === me.id ? ownNote : rankNote) : <LeaveDecision id={r.id} name={who} summary={what} url={`/api/admin/leave-changes/${r.id}/decide`} keys={['confirmLeaveDelete', 'confirmLeaveDeleteReject']} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

        {(focus.k === 'overtime' || (focusDay && ot.length > 0)) && <div id="overtime" className="flex flex-col gap-3">{overtimeTab}</div>}
        {(focus.k === 'corrections' || (focusDay && co.length > 0)) && <div id="corrections" className="flex flex-col gap-3">{correctionsTab}</div>}
        {focus.k === 'leave' && <div id="leave" className="flex flex-col gap-3">{leaveTab}</div>}
        {focus.k === 'work' && <div id="work" className="flex flex-col gap-3">{workTab}</div>}
      </div>
      )}
    </PageShell>
  );
}

// 완료 — 최근 두 달 동안 처리된 요청 전부 (종류가 달라도 한 목록). 자동 검사 계정(e2e-…)의 요청은 뺀다
async function DoneTab({ sp, practice }: { sp: { live?: string; tab?: string; dp?: string; q?: string }; practice: boolean }) {
  const [t, tr, tc] = await Promise.all([getTranslations('admin.inbox'), getTranslations('requests'), getTranslations('common')]);
  const me = (await getMe())!;
  const [all, leaveTypes, { data: staff }, hidden] = await Promise.all([loadRequests({ practice }), loadAllLeaveTypes(), createAdminClient().from('profiles').select('id, name, employee_no'), loadHidden(me.id)]);
  const items = withoutHidden(all, hidden.keys); // 이 관리자가 지운 처리된 요청은 빼고 — 다른 관리자 목록에는 남는다 (2026-10-19)
  const check = new Set((staff ?? []).filter((p) => p.employee_no?.startsWith('e2e-')).map((p) => p.id as string));
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const q = (sp.q ?? '').trim().slice(0, 40).toLowerCase();
  const page = pageOf(splitRequests(items.filter((x) => !check.has(x.employeeId) && (!q || (names.get(x.employeeId) ?? '').toLowerCase().includes(q)))).done, sp.dp, LIST_PAGE);
  const hrefOf = (r: (typeof items)[number]) => (r.kind === 'leave' ? `/admin/leave/req/${r.key.split(':')[1]}` : r.kind === 'shift' ? `/admin/schedule?d=${r.date}` : `/admin/records/${r.employeeId}?m=${r.date.slice(0, 7)}`);
  return (
    <PageShell wide>
      <h1 className="sr-only">{t('title')}</h1>
      <RequestTabs admin active="done" live={sp.live === '1'} q={q} counts={{ pending: (await pendingCounts(practice)).total }} />
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {page.items.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{tr('emptyDone', { days: REQUEST_WINDOW_DAYS })}</p>}
      {/* 폰: 두 줄 목록 · PC: 대기중과 같은 표 */}
      <div className="flex flex-col gap-3 lg:hidden">
        <RequestRows items={page.items} leaveTypes={leaveTypes} names={names} showName hrefOf={hrefOf} hideable={hidden.ready} />
      </div>
      {page.items.length > 0 && (
        <div className="hidden lg:block">
          <RequestRows table openKey="view" items={page.items} leaveTypes={leaveTypes} names={names} showName hrefOf={hrefOf} hideable={hidden.ready} />
        </div>
      )}
      <Pager page={page.page} pages={page.pages} param="dp" params={sp} label={tc('pages')} />
      {page.items.length > 0 && <p className="text-sm text-faint">{tr('doneHint', { days: REQUEST_WINDOW_DAYS })}</p>}
      {hidden.ready && page.items.length > 0 && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-faint">{tr('hideHint')}</p>
          <div><HideRequests all keys={page.items.map((r) => r.key)} /></div>
        </div>
      )}
    </PageShell>
  );
}
