// 월별 근태 증빙 엑셀의 내용 모으기 (②-4 7-5). 서버 전용.
// 숫자는 기록 탭·급여용 CSV와 같은 buildMonth 결과를 쓴다 — 화면과 파일의 숫자가 다르면 증빙이 아니다.
import 'server-only';
import { BRAND } from '@/config/brand';
import { LABOR } from '@/config/labor-rules';
import { OFFICE } from '@/config/office';
import { loadRuleVersions } from '@/lib/attendance-data';
import type { AttendanceReport } from '@/lib/export-xlsx';
import { FLAG } from '@/lib/flags';
import { buildMonth, monthRange } from '@/lib/month-data';
import { daysFor } from '@/lib/period-data';
import { toKstDate } from '@/lib/time';
import { workStatusOn } from '@/lib/work-requests';

const HM = new Intl.DateTimeFormat('en-GB', { timeZone: OFFICE.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DT = new Intl.DateTimeFormat('sv-SE', { timeZone: OFFICE.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hhmm = (d: Date | null | undefined) => (d ? HM.format(d) : null);
const stamp = (d: Date | string | null | undefined) => (d ? DT.format(new Date(d)) : null);
const WEEK = ['', '월', '화', '수', '목', '금', '토', '일'];
const LEAVE_NAME: Record<string, string> = { annual: '연차', half: '반차', quarter: '반반차', sick: '병가', condolence: '경조사', unpaid: '무급휴가' };
const WORK_NAME: Record<string, string> = { outside: '외근', business_trip: '출장', remote: '재택' };
const HOLIDAY_KIND: Record<string, string> = { public: '공휴일', company: '회사 휴일', weekly_rest: '주휴일' };

// 비고에 쓸 확인 필요 사항 — flags 문자열에서 접두어를 떼고, 화면에 이미 칸이 있는 것은 뺀다
const NOTE_SKIP = new Set<string>([FLAG.PENDING_OVERTIME, FLAG.LEAVE_MODULE_MISSING.replace(/^block:/, ''), '출근 미기록']);

export async function buildAttendanceReport(ym: string, practice: boolean, generatedBy: string, unlocked: boolean): Promise<AttendanceReport> {
  const now = new Date();
  const today = toKstDate(now);
  const { from, to } = monthRange(ym);
  const { data, rows } = await buildMonth(ym, practice);
  const nameOf = new Map(data.people.map((p) => [p.id, p.name]));
  const person = new Map(data.people.map((p) => [p.id, p]));
  const upTo = today < to ? today : to;

  const people = rows.map(({ person: p, summary: s }) => {
    const r = s.row;
    const days = upTo >= from ? daysFor(data, p.id, from, upTo) : [];
    const missingOut = s.missingOutDates.length;
    const notes = String(r.flags || '')
      .split(';')
      .filter(Boolean)
      .map((f) => f.replace(/^(block|warn):/, ''))
      .filter((f) => !NOTE_SKIP.has(f))
      .map((f) => (f === FLAG.MISSING_OUT && missingOut ? `${f} ${missingOut}일` : f));
    return {
      employeeNo: p.employeeNo,
      name: p.name,
      workDays: days.filter((d) => d.pairs.some((x) => x.in)).length,
      netMinutes: s.netMinutes,
      approvedOvertime: Number(r.approved_overtime_minutes),
      approvedNight: Number(r.approved_night_minutes),
      approvedHoliday: Number(r.approved_holiday_within8_minutes) + Number(r.approved_holiday_over8_minutes),
      pendingOvertime: Number(r.pending_overtime_minutes) + Number(r.pending_night_minutes) + Number(r.pending_holiday_minutes),
      lateCount: Number(r.late_count),
      lateMinutes: Number(r.late_minutes),
      absentDays: Number(r.absent_days),
      paidLeaveDays: s.paidLeaveDays,
      unpaidLeaveDays: Number(r.unpaid_leave_days ?? 0),
      notes: [...new Set([...notes, ...(s.workDates.length ? [`외근·출장·재택 ${s.workDates.length}일`] : [])])],
    };
  });

  const inMonth = (d: string) => d >= from && d <= to;
  const approved = data.corrections.filter((c) => c.status === 'approved');
  const punches = [
    ...data.events.filter((e) => inMonth(e.workDate)).map((e) => {
      const c = approved.find((x) => x.targetId === e.id);
      const p = person.get(e.employeeId);
      return {
        employeeNo: p?.employeeNo ?? null, name: p?.name ?? '', workDate: e.workDate, kind: e.kind, original: hhmm(e.punchedAt),
        corrected: c?.correctionType === 'modify' ? hhmm(c.newPunchedAt) : null, correctionType: c?.correctionType ?? null,
        officeVerified: e.source === 'admin' ? null : e.ipVerified, source: e.source as string, note: e.note, sort: e.punchedAt.getTime(),
        approvedWork: (() => {
          const k = workStatusOn(e.workDate, e.employeeId, data.workRequests);
          return k ? WORK_NAME[k] : null;
        })(),
      };
    }),
    // 빠진 기록 추가(승인) — 원래 없던 기록이라 '찍은 시각'이 비어 있다
    ...approved.filter((c) => c.correctionType === 'add_missing' && inMonth(c.workDate)).map((c) => {
      const p = person.get(c.employeeId);
      return {
        employeeNo: p?.employeeNo ?? null, name: p?.name ?? '', workDate: c.workDate, kind: c.kind ?? '', original: null, corrected: hhmm(c.newPunchedAt),
        correctionType: 'add_missing', officeVerified: null, approvedWork: null, source: 'correction', note: null, sort: c.newPunchedAt?.getTime() ?? 0,
      };
    }),
  ]
    .sort((a, b) => (a.employeeNo ?? '').localeCompare(b.employeeNo ?? '') || a.name.localeCompare(b.name, 'ko') || a.workDate.localeCompare(b.workDate) || a.sort - b.sort)
    .map(({ sort: _s, ...rest }) => (void _s, rest));

  const eventById = new Map(data.events.map((e) => [e.id, e]));
  const corrections = data.corrections
    .filter((c) => inMonth(c.workDate))
    .map((c) => {
      const p = person.get(c.employeeId);
      return {
        employeeNo: p?.employeeNo ?? null, name: p?.name ?? '', workDate: c.workDate, kind: c.kind ?? '', type: c.correctionType,
        original: c.targetId ? hhmm(eventById.get(c.targetId)?.punchedAt) : null, requested: hhmm(c.newPunchedAt), reason: c.reason, status: c.status,
        requestedBy: nameOf.get(c.requestedBy) ?? '', requestedAt: stamp(c.createdAt) ?? '', decidedBy: c.approvedBy ? (nameOf.get(c.approvedBy) ?? '') : null, decidedAt: stamp(c.decidedAt),
      };
    })
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.name.localeCompare(b.name, 'ko'));

  const leave = data.leaveRequests
    .filter((l) => l.startDate <= to && l.endDate >= from)
    .map((l) => {
      const p = person.get(l.employeeId);
      return {
        employeeNo: p?.employeeNo ?? null, name: p?.name ?? '', type: LEAVE_NAME[l.typeCode] ?? l.typeCode, start: l.startDate, end: l.endDate, days: l.days, status: l.status,
        decidedBy: l.approvedBy ? (nameOf.get(l.approvedBy) ?? '') : null, decidedAt: stamp(l.decidedAt),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'ko'));

  const work = data.workRequests
    .filter((w) => w.startDate <= to && w.endDate >= from)
    .map((w) => {
      const p = person.get(w.employeeId);
      return {
        employeeNo: p?.employeeNo ?? null, name: p?.name ?? '', kind: WORK_NAME[w.kind], start: w.startDate, end: w.endDate,
        hours: w.startTime ? `${w.startTime}~${w.endTime}` : null, place: w.place, status: w.status,
        decidedBy: w.approvedBy ? (nameOf.get(w.approvedBy) ?? '') : null, decidedAt: stamp(w.decidedAt),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'ko'));

  // 이 달에 적용된 근무규칙 판: 달 시작에 유효하던 것 + 달 중에 새로 시작한 것
  const versions = (await loadRuleVersions()).slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const startIdx = versions.map((v) => v.effectiveFrom <= from).lastIndexOf(true);
  const used = versions.filter((v, i) => i === startIdx || (v.effectiveFrom > from && v.effectiveFrom <= to));
  const t5 = (s: string | null) => (s ? s.slice(0, 5) : '');
  const rules = used.map(({ effectiveFrom, rule }) => ({
    effectiveFrom,
    hours: `${t5(rule.startTime)} ~ ${t5(rule.endTime)}`,
    grace: `${rule.lateGraceMin}분`,
    breakTime: rule.breakStart ? `${t5(rule.breakStart)} ~ ${t5(rule.breakEnd)}` : '없음',
    workdays: rule.workdays.map((d) => WEEK[d]).join('·'),
    restDay: WEEK[rule.weeklyRestDay] ?? '',
  }));

  return {
    company: BRAND.name,
    yearMonth: ym,
    from,
    to,
    countedUntil: upTo,
    generatedAt: stamp(now)!,
    generatedBy,
    practice,
    unlocked,
    people,
    punches,
    corrections,
    leave,
    work,
    rules,
    holidays: data.holidays.filter((h) => inMonth(h.date)).map((h) => ({ date: h.date, kind: HOLIDAY_KIND[h.kind] ?? h.kind })),
    settings: [
      ['하루 소정근로', `${LABOR.dailyRegularLimitMin / 60}시간`],
      ['주 소정근로', `${LABOR.weeklyRegularLimitMin / 60}시간`],
      ['주 최대 근로(주의 / 한도)', `${OFFICE.weeklyCautionHours}시간 / ${OFFICE.weeklyLimitHours}시간`],
      ['연장 확인 기준', `하루 ${OFFICE.overtimeReviewThresholdMin}분 이상이면 승인 대상`],
      ['결근 판정 시각', `${OFFICE.absentCheckTime} 이후 출근 기록 없으면 결근 후보`],
      ['사업장 규모', OFFICE.workplaceSize === '5_or_more' ? '상시 5인 이상' : '상시 5인 미만'],
      ['계산 버전', OFFICE.calcVersion],
    ],
  };
}

/** 파일 이름 (②-4 7-5 요점 6): 근태확인서_{사업장}_{YYYY-MM}_{생성일시}[_미잠금][_연습].xlsx */
export function reportFileName(ym: string, now: Date, unlocked: boolean, practice: boolean): string {
  const s = DT.format(now).replace(/[-: ]/g, '').slice(0, 12); // YYYYMMDDHHMM
  return `근태확인서_${BRAND.name}_${ym}_${s}${unlocked ? '_미잠금' : ''}${practice ? '_연습' : ''}.xlsx`;
}
