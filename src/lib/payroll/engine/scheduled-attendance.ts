import type { LeaveOnDay } from '@/lib/leave';
import type { DayPlan } from '@/lib/shifts';
import { kstDateTime } from '@/lib/time';
import { calcWorkMinutes } from '@/lib/worktime';

/** 일정 합집합에서 승인 휴가 구간과 휴게를 한 번씩 제외한다. */
export function scheduledMinutes(plan: DayPlan, date: string, leaves: readonly LeaveOnDay[] = []): number {
  if (!plan.rule || !plan.items.length) return 0;
  const intervals: [number, number][] = [];
  for (const item of [...plan.items].sort((a,b) => a.startTime.localeCompare(b.startTime))) {
    const s = kstDateTime(date,item.startTime).getTime(), e = kstDateTime(date,item.endTime).getTime();
    if (e <= s) continue;
    const last = intervals[intervals.length-1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else intervals.push([s,e]);
  }
  let work = intervals;
  for (const leave of leaves.filter((l) => l.startTime && l.endTime)) {
    const s = kstDateTime(date,leave.startTime!).getTime(), e = kstDateTime(date,leave.endTime!).getTime();
    work = work.flatMap(([a,b]): [number,number][] => e<=a || s>=b ? [[a,b]] : [...(a<s ? [[a,s] as [number,number]] : []), ...(e<b ? [[e,b] as [number,number]] : [])]);
  }
  const result = calcWorkMinutes(work.map(([a,b]) => ({ in: new Date(a),out: new Date(b) })),{ ...plan.rule,roundStepMin:0 },{ workDate:date,dayType:'workday',weekRegularMinutesSoFar:0,weekTotalMinutesSoFar:0 });
  // 시각 없는 휴가(종일 · 시각 미정 반차)는 그날 일정의 순근무시간 × 단위 — 단시간 근무자를 480분(8시간)으로 깎지 않는다 (2026-10-15)
  const untimedUnits = leaves.filter((l) => !l.startTime || !l.endTime).reduce((a,l) => a+l.unit,0);
  return Math.max(0,result.netMinutes-Math.round(result.netMinutes*Math.min(1,untimedUnits)));
}

/** 휴게와 겹치는 시간은 휴가의 순근무시간에 포함하지 않는다. */
export function scheduledLeaveMinutes(plan: DayPlan, date: string, leave: LeaveOnDay): number {
  return scheduledMinutes(plan,date)-scheduledMinutes(plan,date,[leave]);
}
/** 시각을 정한 휴가가 선언한 시간만큼 일정을 비우는가. 시각 없는 휴가는 그날 일정 전체(× 단위)로 보므로 비교하지 않는다 */
export function leaveDurationMismatch(plan: DayPlan,date: string,leaves: readonly LeaveOnDay[]): boolean {
  return leaves.some((l) => !!l.startTime && !!l.endTime && scheduledLeaveMinutes(plan,date,l)!==Math.round(l.unit*480));
}

/** 휴게·분할 일정의 빈 시간을 제외하고 요청한 근무시간만큼 쉴 수 있는 끝 시각을 구한다. */
export function leaveWindowForPlan(plan: DayPlan,date: string,hours: number,startTime: string): {startTime:string;endTime:string}|null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !Number.isFinite(hours) || hours<=0) return null;
  const start=Number(startTime.slice(0,2))*60+Number(startTime.slice(3,5));
  for (let end=start+1;end<1440;end++) {
    const endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
    const minutes=scheduledLeaveMinutes(plan,date,{typeCode:'',isPaid:false,unit:hours/8,requestId:'',startTime,endTime});
    if (minutes===Math.round(hours*60)) return {startTime,endTime};
  }
  return null;
}
