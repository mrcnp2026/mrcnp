// ② 처리함 — 사람이 판단해야 하는 것을 한 받은함에 (마스터 5장): 연장근로 승인(7-7) · 정정 요청(7-10).
// 그날 근무노트를 연장 요청 옆에 보여 준다 (R-10-2의 8) — 사유로 자동 복사하지 않는다.
// 누가·언제 처리했는지 항상 보인다 (R-2의 5).
import { getFormatter, getTranslations } from 'next-intl/server';
import { Pager, pageOf } from '@/components/Pager';
import { Help } from '@/components/Help';
import { InboxTabs } from './InboxTabs';
import { RequestTabs } from '@/components/RequestTabs';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { getMe } from '@/lib/auth';
import { addDays } from '@/lib/calendar';
import { hiddenTestIds, loadPeriod, pendingCounts, syncOvertimeRequests } from '@/lib/period-data';
import { loadStaff } from '@/lib/staff-data';
import { selfDecisionBlocked } from '@/lib/staff-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import Link from 'next/link';
import { leaveTypeName, calcLeaveBalance } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { loadRequests, REQUEST_WINDOW_DAYS } from '@/lib/request-data';
import { splitRequests } from '@/lib/requests';
import { RequestRows } from '@/components/RequestRows';
import { loadWorkRequests } from '@/lib/work-data';
import { CorrectionDecision, LeaveDecision, OvertimeDecision, WorkDecision } from './Decisions';

// 요청은 종류마다 한 쪽에 5건까지 — 넘으면 아래에 쪽 번호 (2026-10-06 의뢰인)
const REQUEST_PAGE = 5;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ live?: string; op?: string; cp?: string; lp?: string; wp?: string; tab?: string; dp?: string; q?: string }> }) {
  const t = await getTranslations('admin.inbox');
  const f = await getFormatter();
  const me = (await getMe())!;
  // 자기 요청은 다른 관리자가 처리한다 — 다른 관리자가 있을 때만 막는다 (staff-rules.ts)
  const ownBlocked = selfDecisionBlocked(me.id, me.id, await loadStaff());
  const ownNote = <p className="text-sm text-muted">{t('selfBlocked')}</p>;
  const sp = await searchParams;
// ★ 연습 모드에서는 모든 기록이 연습 기록이다 — 관리자 화면도 기본으로 연습 기록을 본다 (2026-10-02: 시험직원 정정 요청이 관리자에게 0건으로 보이던 문제). ?live=1이면 실제 기록
  const practice = OFFICE.practiceMode && sp.live !== '1';
  if (sp.tab === 'done') return <DoneTab sp={sp} practice={practice} />;
  const today = toKstDate(new Date());
  const data = await loadPeriod(addDays(today, -31), today, practice);
  await syncOvertimeRequests(data, today);

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
  const hit = (id: string) => !hidden.has(id) && (!q || (name.get(id) ?? '').toLowerCase().includes(q));
  const ot = (otAll ?? []).filter((o) => hit(o.employee_id));
  const co = (coAll ?? []).filter((c) => hit(c.employee_id));
  const keys = [...(ot ?? []).map((o) => [o.employee_id, o.work_date]), ...(co ?? []).map((c) => [c.employee_id, c.work_date])];
  const empIds = [...new Set(keys.map((k) => k[0]))];
  const dates = [...new Set(keys.map((k) => k[1]))];
  const [{ data: notes }, { data: evs }] = await Promise.all([
    empIds.length
      ? db.from('work_notes').select('employee_id, work_date, body, created_at').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { employee_id: string; work_date: string; body: string }[] }),
    empIds.length
      ? db.from('punch_events').select('id, employee_id, work_date, kind, punched_at').in('employee_id', empIds).in('work_date', dates).eq('is_test', practice).order('punched_at')
      : Promise.resolve({ data: [] as { id: string; employee_id: string; work_date: string; kind: string; punched_at: string }[] }),
  ]);
  const noteOf = (e: string, d: string) => notes?.find((n) => n.employee_id === e && n.work_date === d)?.body ?? null;
  const hm = (iso: string | null) => (iso ? f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—');
  const dayLabel = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { month: 'short', day: 'numeric', weekday: 'short' });
  const punchesOf = (e: string, d: string) =>
    (evs ?? []).filter((x) => x.employee_id === e && x.work_date === d).map((x) => `${x.kind === 'in' ? '↘' : '↗'} ${hm(x.punched_at)}`).join('  ');

  const { data: punchRows } = await db.from('punch_requests').select('id, employee_id, kind, requested_at, work_date, nearest_m, geo_reason').eq('is_test', practice).eq('status', 'pending').order('requested_at');
  const punchPending = ((punchRows ?? []) as { id: string; employee_id: string; kind: 'in' | 'out'; requested_at: string; work_date: string; nearest_m: number | null; geo_reason: string }[]).filter((r) => hit(r.employee_id));
  const { data: shiftRows } = await db.from('shift_requests').select('id, employee_id, work_date, start_time, end_time, kind, reason').eq('is_test', practice).eq('status', 'pending').order('work_date');
  const shiftPending = ((shiftRows ?? []) as { id: string; employee_id: string; work_date: string; start_time: string; end_time: string; kind: string; reason: string | null }[]).filter((r) => hit(r.employee_id));
  const tc = await getTranslations('common');
  const otPage = pageOf(ot ?? [], sp.op, REQUEST_PAGE);
  const coPage = pageOf(co ?? [], sp.cp, REQUEST_PAGE);

  // 연차·휴가 신청 (②-2 게이트 5): 남은 연차 + 그 날짜 출근 기록 충돌 경고 (자동으로 지우지 않는다, 요점 4)
  const tl = await getTranslations('leave');
  const [leaveTypes, leavePending] = await Promise.all([loadAllLeaveTypes(), loadLeaveRequests({ practice }).then((rs) => rs.filter((r) => r.status === 'pending' && hit(r.employeeId)))]);
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
  const workPending = (await loadWorkRequests({ practice })).filter((w) => w.status === 'pending' && hit(w.employeeId)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const wkPage = pageOf(workPending, sp.wp, REQUEST_PAGE);

  // 표(PC)와 카드(폰)가 같은 값을 쓰도록 한 번만 계산한다
  const th = 'px-4 py-3 text-left text-xs font-medium whitespace-nowrap text-faint';
  const td = 'px-4 py-3 align-top';
  const who = (id: string, extra?: React.ReactNode) => (
    <span className="flex flex-col items-start gap-1">
      <span className="font-semibold whitespace-nowrap">{name.get(id)}</span>
      {extra}
      {id === me.id && <Chip>{t('self')}</Chip>}
    </span>
  );
  const lvRows = lvPage.items.map((r) => {
    const bal = calcLeaveBalance({ grants: leaveGrants.filter((g) => g.employeeId === r.employeeId), requests: leaveAll.filter((x) => x.employeeId === r.employeeId), types: leaveTypes, asOf: r.startDate });
    const deducts = leaveTypes.find((x) => x.code === r.typeCode)?.deductsBalance;
    const clash = [...new Set((leavePunches ?? []).filter((p) => p.employee_id === r.employeeId && p.work_date >= r.startDate && p.work_date <= r.endDate).map((p) => p.work_date))];
    const range = r.startDate === r.endDate ? `${dayLabel(r.startDate)}${r.startTime ? ` ${r.startTime}-${r.endTime}` : ''}` : `${dayLabel(r.startDate)} ~ ${dayLabel(r.endDate)}`;
    const summary = `${leaveName(r.typeCode)} ${tl('days', { n: nDays(r.days) })} (${range})`;
    const balance = deducts ? (bal.grant ? t('leaveBalance', { remaining: nDays(bal.remaining), pending: nDays(bal.pending) }) : t('leaveNoGrant')) : null;
    return { r, clash, range, summary, balance };
  });
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
  const empty = <p className="rounded-card bg-bg p-5 text-sm text-faint">{t('empty')}</p>;
  const hint = (text: string) => (
    <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
      {t('tabHelp')}
      <Help>{text}</Help>
    </div>
  );

  const overtimeTab = (
    <>
      {hint(t('overtimeHint'))}
      {(ot ?? []).length === 0 && empty}
      {/* PC: 표 한 줄 = 요청 한 건 (2026-10-06 의뢰인: 카드·둥근 버튼 대신 표) */}
      {otPage.items.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colWho'), t('colDate'), t('colPunch'), t('overtime'), t('night'), t('holiday'), t('colReason'), t('colAction')].map((x, i) => (
                  <th key={x} scope="col" className={`${th} ${i >= 3 && i <= 5 ? 'text-right' : ''}`}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {otPage.items.map((o) => (
                <tr key={o.id}>
                  <td className={td}>{who(o.employee_id, o.needs_review && <Chip tone="warn">{t('needsReview')}</Chip>)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{dayLabel(o.work_date)}</td>
                  <td className={`${td} num text-muted`}>{punchesOf(o.employee_id, o.work_date) || '–'}</td>
                  {(['overtime', 'night', 'holiday'] as const).map((k) => (
                    <td key={k} className={`${td} num text-right whitespace-nowrap`}>
                      <span className="font-semibold">{t('min', { n: o[`${k}_minutes`] })}</span>
                      {o.needs_review && o[`recomputed_${k}_minutes`] !== null && <span className="block text-xs text-warn">{t('nowCounted', { n: o[`recomputed_${k}_minutes`] })}</span>}
                    </td>
                  ))}
                  <td className={`${td} text-muted`}>
                    {o.reason && <span className="block text-text">{o.reason}</span>}
                    {noteOf(o.employee_id, o.work_date) && <span className="block whitespace-pre-wrap break-words">{t('note')}: {noteOf(o.employee_id, o.work_date)}</span>}
                    {o.status !== 'pending' && <span className="block text-xs">{t('decidedBy', { status: t(`status.${o.status}`), who: name.get(o.approved_by) ?? '—' })}</span>}
                    {!o.reason && !noteOf(o.employee_id, o.work_date) && o.status === 'pending' && '–'}
                  </td>
                  <td className={`${td} w-72`}>
                    {ownBlocked && o.employee_id === me.id ? ownNote : <OvertimeDecision compact id={o.id} name={name.get(o.employee_id) ?? ''} facts={{ overtime: o.overtime_minutes, night: o.night_minutes, holiday: o.holiday_minutes }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex flex-col gap-3 lg:hidden">
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
            {noteOf(o.employee_id, o.work_date) && (
              <p className="rounded-button bg-surface p-2 text-sm">
                <span className="block text-xs text-muted">{t('note')}</span>
                <span className="whitespace-pre-wrap break-words">{noteOf(o.employee_id, o.work_date)}</span>
              </p>
            )}
            {o.status !== 'pending' && (
              <p className="text-xs text-muted">{t('decidedBy', { status: t(`status.${o.status}`), who: name.get(o.approved_by) ?? '—' })}</p>
            )}
            {ownBlocked && o.employee_id === me.id ? ownNote : <OvertimeDecision id={o.id} name={name.get(o.employee_id) ?? ''} facts={{ overtime: o.overtime_minutes, night: o.night_minutes, holiday: o.holiday_minutes }} />}
          </Card>
        ))}
      </div>
      <Pager page={otPage.page} pages={otPage.pages} param="op" params={sp} anchor="overtime" label={tc('pages')} />
    </>
  );

  const correctionsTab = (
    <>
      {(co ?? []).length === 0 && empty}
      {coRows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colWho'), t('colDate'), t('colType'), t('colChange'), t('colReason'), t('colAction')].map((x) => (
                  <th key={x} scope="col" className={th}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coRows.map(({ c, line }) => (
                <tr key={c.id}>
                  <td className={td}>{who(c.employee_id)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{dayLabel(c.work_date)}</td>
                  <td className={`${td} whitespace-nowrap`}>{t(`type.${c.correction_type}`)}</td>
                  <td className={`${td} num font-semibold`}>{line}</td>
                  <td className={td}>{c.reason}</td>
                  <td className={`${td} w-64`}>{ownBlocked && c.employee_id === me.id ? ownNote : <CorrectionDecision compact id={c.id} name={name.get(c.employee_id) ?? ''} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex flex-col gap-3 lg:hidden">
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
            {ownBlocked && c.employee_id === me.id ? ownNote : <CorrectionDecision id={c.id} name={name.get(c.employee_id) ?? ''} />}
          </Card>
        ))}
      </div>
      <Pager page={coPage.page} pages={coPage.pages} param="cp" params={sp} anchor="corrections" label={tc('pages')} />
    </>
  );

  const leaveTab = (
    <>
      {leavePending.length === 0 && empty}
      {lvRows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colWho'), t('colPeriod'), t('colType'), t('colBalance'), t('colReason'), t('colAction')].map((x) => (
                  <th key={x} scope="col" className={th}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lvRows.map(({ r, clash, range, summary, balance }) => (
                <tr key={r.id}>
                  <td className={td}>{who(r.employeeId)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{range}</td>
                  <td className={`${td} num font-semibold whitespace-nowrap`}>{leaveName(r.typeCode)} · {tl('days', { n: nDays(r.days) })}</td>
                  <td className={`${td} num text-muted`}>{balance ?? '–'}</td>
                  <td className={td}>
                    {r.reason ?? (clash.length === 0 ? '–' : null)}
                    {clash.length > 0 && <span className="mt-1 block rounded-button border border-warn bg-warn-tint p-2 text-warn">{t('leaveClash', { dates: clash.map(dayLabel).join(', ') })}</span>}
                  </td>
                  <td className={`${td} w-64`}>{ownBlocked && r.employeeId === me.id ? ownNote : <LeaveDecision compact id={r.id} name={name.get(r.employeeId) ?? ''} summary={summary} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex flex-col gap-3 lg:hidden">
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
            {ownBlocked && r.employeeId === me.id ? ownNote : <LeaveDecision id={r.id} name={name.get(r.employeeId) ?? ''} summary={summary} />}
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
      {wkRows.length > 0 && (
        <Card className="hidden overflow-x-auto p-0 lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t('colWho'), t('colPeriod'), t('colType'), t('place'), t('colReason'), t('colAction')].map((x) => (
                  <th key={x} scope="col" className={th}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {wkRows.map(({ w, when }) => (
                <tr key={w.id}>
                  <td className={td}>{who(w.employeeId)}</td>
                  <td className={`${td} num whitespace-nowrap`}>{when}</td>
                  <td className={`${td} font-semibold whitespace-nowrap`}>{t(`workKind.${w.kind}`)}</td>
                  <td className={td}>{w.place}</td>
                  <td className={td}>{w.reason ?? '–'}</td>
                  <td className={`${td} w-64`}>{ownBlocked && w.employeeId === me.id ? ownNote : <WorkDecision compact id={w.id} name={name.get(w.employeeId) ?? ''} summary={`${t(`workKind.${w.kind}`)} (${when})`} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <div className="flex flex-col gap-3 lg:hidden">
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
            {ownBlocked && w.employeeId === me.id ? ownNote : <WorkDecision id={w.id} name={name.get(w.employeeId) ?? ''} summary={`${t(`workKind.${w.kind}`)} (${when})`} />}
          </Card>
        ))}
      </div>
      <Pager page={wkPage.page} pages={wkPage.pages} param="wp" params={sp} anchor="work" label={tc('pages')} />
    </>
  );

  return (
    <PageShell wide>
      <h1 className="sr-only">{t('title')}</h1>
      <RequestTabs admin active="pending" live={sp.live === '1'} q={q} counts={{ pending: (ot?.length ?? 0) + (co?.length ?? 0) + leavePending.length + workPending.length + punchPending.length + shiftPending.length }} />
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}

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
                  <p className="num text-sm text-muted">{r.geo_reason === 'outside' && r.nearest_m !== null ? t('punchFar', { m: r.nearest_m }) : t(`punchWhy.${r.geo_reason}`)}</p>
                  {r.employee_id === me.id && ownBlocked ? ownNote : <LeaveDecision id={r.id} name={who} summary={what} url={`/api/admin/punch-requests/${r.id}/decide`} keys={['confirmPunch', 'confirmPunchReject']} />}
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
                  {r.employee_id === me.id && ownBlocked ? ownNote : <LeaveDecision id={r.id} name={who} summary={what} url={`/api/admin/schedule-requests/${r.id}/decide`} keys={['confirmShift', 'confirmShiftReject']} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <InboxTabs
        label={t('tabs')}
        tabs={[
          { key: 'overtime', label: t('overtimeTitle'), count: ot?.length ?? 0, content: overtimeTab },
          { key: 'corrections', label: t('correctionsTitle'), count: co?.length ?? 0, content: correctionsTab },
          { key: 'leave', label: t('leaveTitle'), count: leavePending.length, content: leaveTab },
          { key: 'work', label: t('workTitle'), count: workPending.length, content: workTab },
        ]}
      />

    </PageShell>
  );
}

// 완료 — 최근 두 달 동안 처리된 요청 전부 (종류가 달라도 한 목록). 자동 검사 계정(e2e-…)의 요청은 뺀다
async function DoneTab({ sp, practice }: { sp: { live?: string; tab?: string; dp?: string; q?: string }; practice: boolean }) {
  const [t, tr, tc] = await Promise.all([getTranslations('admin.inbox'), getTranslations('requests'), getTranslations('common')]);
  const [items, leaveTypes, { data: staff }] = await Promise.all([loadRequests({ practice }), loadAllLeaveTypes(), createAdminClient().from('profiles').select('id, name, employee_no')]);
  const check = new Set((staff ?? []).filter((p) => p.employee_no?.startsWith('e2e-')).map((p) => p.id as string));
  const names = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const q = (sp.q ?? '').trim().slice(0, 40).toLowerCase();
  const page = pageOf(splitRequests(items.filter((x) => !check.has(x.employeeId) && (!q || (names.get(x.employeeId) ?? '').toLowerCase().includes(q)))).done, sp.dp, 20);
  return (
    <PageShell wide>
      <h1 className="sr-only">{t('title')}</h1>
      <RequestTabs admin active="done" live={sp.live === '1'} q={q} counts={{ pending: (await pendingCounts(practice)).total }} />
      {practice && <p className="rounded-card bg-primary-tint p-3 text-sm text-primary">{t('practiceBanner')}</p>}
      {page.items.length === 0 && <p className="rounded-card bg-bg p-5 text-sm text-faint">{tr('emptyDone', { days: REQUEST_WINDOW_DAYS })}</p>}
      <RequestRows items={page.items} leaveTypes={leaveTypes} names={names} showName hrefOf={(r) => (r.kind === 'leave' ? `/admin/leave/req/${r.key.split(':')[1]}` : r.kind === 'shift' ? `/admin/schedule?d=${r.date}` : `/admin/records/${r.employeeId}?m=${r.date.slice(0, 7)}`)} />
      <Pager page={page.page} pages={page.pages} param="dp" params={sp} label={tc('pages')} />
      {page.items.length > 0 && <p className="text-sm text-faint">{tr('doneHint', { days: REQUEST_WINDOW_DAYS })}</p>}
    </PageShell>
  );
}
