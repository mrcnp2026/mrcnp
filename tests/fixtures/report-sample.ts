// 근태 확인서 견본 데이터 (검사·견본 파일 공용)
import type { AttendanceReport } from '@/lib/export-xlsx';

export const SAMPLE: AttendanceReport = {
  company: 'MRCNP', yearMonth: '2026-10', from: '2026-10-01', to: '2026-10-31', countedUntil: '2026-10-31',
  generatedAt: '2026-11-02 09:15', generatedBy: '관리자', practice: false, unlocked: true,
  people: [
    { employeeNo: '001', name: '김민수', workDays: 21, netMinutes: 10140, approvedOvertime: 240, approvedNight: 0, approvedHoliday: 0, pendingOvertime: 90, lateCount: 2, lateMinutes: 25, absentDays: 0, paidLeaveDays: 1, unpaidLeaveDays: 0, notes: [] },
    { employeeNo: '014', name: 'Nguyen Van An', workDays: 19, netMinutes: 9120, approvedOvertime: 0, approvedNight: 0, approvedHoliday: 0, pendingOvertime: 0, lateCount: 0, lateMinutes: 0, absentDays: 1, paidLeaveDays: 0.5, unpaidLeaveDays: 1, notes: ['퇴근 미기록 1일'] },
  ],
  punches: [{ employeeNo: '001', name: '김민수', workDate: '2026-10-05', kind: 'in', original: '08:52', corrected: null, correctionType: null, officeVerified: true, source: 'web', note: null }],
  corrections: [{ employeeNo: '014', name: 'Nguyen Van An', workDate: '2026-10-07', kind: 'out', type: 'add_missing', original: null, requested: '18:05', reason: '퇴근 누름 잊음', status: 'approved', requestedBy: 'Nguyen Van An', requestedAt: '2026-10-08 09:01', decidedBy: '관리자', decidedAt: '2026-10-08 10:00' }],
  leave: [{ employeeNo: '001', name: '김민수', type: '연차', start: '2026-10-16', end: '2026-10-16', days: 1, status: 'approved', decidedBy: '관리자', decidedAt: '2026-10-10 11:00' }],
  work: [{ employeeNo: '014', name: 'Nguyen Van An', kind: '외근', start: '2026-10-20', end: '2026-10-20', hours: '13:00~17:00', place: '고객사 현장', status: 'approved', decidedBy: '관리자', decidedAt: '2026-10-21 09:00' }],
  rules: [{ effectiveFrom: '2026-10-01', hours: '09:00 ~ 18:00', grace: '10분', breakTime: '12:00 ~ 13:00', workdays: '월·화·수·목·금', restDay: '일' }],
  holidays: [{ date: '2026-10-03', kind: '공휴일' }, { date: '2026-10-09', kind: '공휴일' }],
  settings: [['주 소정근로', '40시간']],
};
