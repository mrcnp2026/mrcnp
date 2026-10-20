// 직원 여러 명 엑셀 등록 (2026-10-20) — 읽기 · 검사
import { describe, expect, it } from 'vitest';
import { readStaff, staffTemplate, STAFF_COLS, toDate, type StaffLabels } from '@/lib/staff-bulk';

const L: StaffLabels = { sheet: '직원', guide: '안내', cols: { employeeNo: '사번', name: '이름', joinedOn: '입사일', phone: '전화', email: '이메일', jobTitle: '직책', group: '소속', job: '직무', nationality: '국적', visaType: '체류자격', stayUntil: '체류기간끝', englishName: '영어 이름', dormitory: '숙소' } };
const ctx = { existingNos: new Set(['M001']), groups: [{ id: 'g1', label: '1공장 › 골판지' }], jobs: [{ id: 'j1', label: '시급제' }], today: '2026-10-20' };
const head = STAFF_COLS.map((c) => L.cols[c]);

describe('직원 엑셀 등록', () => {
  it('날짜 여러 모양', () => {
    expect([toDate('2026-01-02'), toDate('2026.1.2'), toDate('20260102'), toDate('2026-02-30'), toDate('')]).toEqual(['2026-01-02', '2026-01-02', '2026-01-02', undefined, null]);
  });
  it('양식 머리 줄', () => {
    expect(staffTemplate([], [], L).worksheets[0].getRow(2).values).toEqual([undefined, ...head]);
  });
  it('읽기 · 검사 — 있는 사번 · 같은 사번 두 번 · 모르는 소속 · 외국인', () => {
    const rows = [['안내'], head,
      ['M100', '김가', '2026.3.1', '010-1234-5678', 'A@B.COM', '반장', '골판지', '시급제', 'TH', 'e-9', '2027-03-01', 'somchai k', '1공장 기숙사 2호'],
      ['M001', '이나'], ['M100', '박다'], ['M101', '최라', '', '', '', '', '없는팀'], ['', '이름만'], ['M102', '정마', '', '123'],
      ['M103', '한바', '', '', '', '', '', '', 'KR', 'E-9']];
    const r = readStaff(rows, ctx, L)!;
    expect(r.map((x) => x.error)).toEqual([null, 'duplicate_no', 'import_duplicate', 'import_unknown_group', 'import_required', 'invalid_phone', null]);
    expect(r[0].input).toEqual({ employeeNo: 'M100', name: '김가', joinedOn: '2026-03-01', phone: '01012345678', email: 'a@b.com', jobTitle: '반장', groupId: 'g1', jobId: 'j1', nationality: 'TH', visaType: 'E-9', stayUntil: '2027-03-01', englishName: 'SOMCHAI K', dormitory: '1공장 기숙사 2호' });
    expect(r[6].input?.nationality).toBeNull(); // 내국인이면 체류 칸은 버린다
  });
});
