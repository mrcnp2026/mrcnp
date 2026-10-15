import { expect,it } from 'vitest';
import { leaveDurationMismatch, leaveWindowForPlan, scheduledMinutes } from '@/lib/payroll/engine/scheduled-attendance';
import { timeFromAttendance } from '@/lib/payroll/engine/attendance';
import type { DayPlan } from '@/lib/shifts';
const plan: DayPlan = { rule: {startTime:'09:00',endTime:'18:00',breakStart:'12:00',breakEnd:'13:00',lateGraceMin:0,workdays:[1,2,3,4,5],weeklyRestDay:7},deemed:null,items:[{startTime:'09:00',endTime:'18:00',kind:'normal',name:null,color:null,shiftId:null,note:null,source:'rule'}] };
it('일정 9시간에서 점심 1시간을 제외한다',()=>expect(scheduledMinutes(plan,'2026-10-12')).toBe(480));
it('오전 유급휴가는 기본 일정시간에서 빼고 유급휴가로 따로 지급할 수 있다',()=>{
 const minutes=scheduledMinutes(plan,'2026-10-12',[{typeCode:'half',isPaid:true,unit:0.5,requestId:'r',startTime:'09:00',endTime:'14:00'}]);
 expect(minutes).toBe(240);
 const result=timeFromAttendance({regularMinutes:0,netMinutes:0,payableMinutes:0,scheduleMinutes:minutes,approved:{overtime:0,night:0,holidayWithin8:0,holidayOver8:0},pendingMinutes:0,paidLeaveDays:0.5,flags:[],unconfirmedDays:0},'SCHEDULE','HOURLY',480,'ACTUAL');
 expect(result.time?.workedMinutes).toBe(240);expect(result.time?.paidLeaveMinutes).toBe(240);
});
it('중복 일정과 분할 일정의 빈 시간을 중복 지급하지 않는다',()=>{
 const items=[['09:00','12:00'],['10:00','12:00'],['14:00','17:00']].map(([startTime,endTime])=>({...plan.items[0],startTime,endTime}));
 expect(scheduledMinutes({...plan,items},'2026-10-12')).toBe(360);
});

it('점심을 포함한 09–13시를 순휴가 4시간으로 잘못 계산하지 않는다',()=>{
 expect(leaveDurationMismatch(plan,'2026-10-12',[{typeCode:'half',isPaid:true,unit:0.5,requestId:'r',startTime:'09:00',endTime:'13:00'}])).toBe(true);
 expect(leaveDurationMismatch(plan,'2026-10-12',[{typeCode:'half',isPaid:true,unit:0.5,requestId:'r',startTime:'09:00',endTime:'14:00'}])).toBe(false);
});

it('4시간 오전 휴가는 09시부터 점심을 건너뛰어 14시에 끝난다',()=>{
 expect(leaveWindowForPlan(plan,'2026-10-12',4,'09:00')).toEqual({startTime:'09:00',endTime:'14:00'});
 expect(leaveWindowForPlan(plan,'2026-10-12',4,'17:00')).toBeNull();
});

// 2026-10-15 회귀: 하루 4시간 일정인 단시간 근무자의 종일 휴가(시각 없음)가 480분과 비교돼 막히던 문제
it('단시간 근무자의 시각 없는 종일 휴가는 그날 일정 전체를 비우고 막지 않는다',()=>{
 const short: DayPlan={...plan,rule:{...plan.rule!,breakStart:null,breakEnd:null},items:[{...plan.items[0],startTime:'09:00',endTime:'13:00'}]};
 const full={typeCode:'annual',isPaid:true,unit:1,requestId:'r'};
 expect(leaveDurationMismatch(short,'2026-10-12',[full])).toBe(false);
 expect(scheduledMinutes(short,'2026-10-12',[full])).toBe(0);
 expect(scheduledMinutes(short,'2026-10-12',[{...full,unit:0.5}])).toBe(120);
});

// 2026-10-15 회귀: 일정 기준 시급제에서 인정된 연장 2시간의 1.0배분이 빠지던 문제
it('일정 기준 시급제는 일정 시간에 인정된 연장 · 휴일 시간을 더해 지급한다',()=>{
 const r=timeFromAttendance({regularMinutes:0,netMinutes:0,payableMinutes:0,scheduleMinutes:480,approved:{overtime:120,night:0,holidayWithin8:60,holidayOver8:0},pendingMinutes:0,paidLeaveDays:0,flags:[],unconfirmedDays:0},'SCHEDULE','HOURLY',480,'ACTUAL');
 expect(r.time?.workedMinutes).toBe(660);expect(r.time?.overtimeMinutes).toBe(120);
});
