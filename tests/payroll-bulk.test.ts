// 급여대장 한꺼번에 넣기 (2026-10-20) — 엑셀 양식 · 읽기
import { describe, expect, it } from 'vitest';
import { bulkColumns, bulkTemplate, readBulk, type BulkLabels } from '@/lib/payroll/bulk-adjust';

const L: BulkLabels = { sheet: '조정', guide: '빈 칸은 그대로', employeeNo: '사번', name: '이름', kind: { PAYMENT: '지급', DEDUCTION: '공제' } };
const items = [
  { code: 'BONUS', kind: 'PAYMENT' as const, koName: '상여금', calcKind: 'MANUAL', inUse: true },
  { code: 'BASE_PAY', kind: 'PAYMENT' as const, koName: '기본급', calcKind: 'FIXED', inUse: true },
  { code: 'ADVANCE', kind: 'DEDUCTION' as const, koName: '가불', calcKind: 'MANUAL', inUse: true },
  { code: 'OLD', kind: 'DEDUCTION' as const, koName: '옛 공제', calcKind: 'MANUAL', inUse: false },
];
const members = [{ employeeId: 'a', employeeNo: 'M001', name: '김가' }, { employeeId: 'b', employeeNo: 'M002', name: '이나' }, { employeeId: 'c', employeeNo: null, name: '박다' }];

describe('한꺼번에 넣기', () => {
  it('넣을 수 있는 항목: 공제 전부 + 직접 넣는 지급, 꺼진 항목 빼기', () => {
    expect(bulkColumns(items).map((c) => c.code)).toEqual(['BONUS', 'ADVANCE']);
  });
  it('양식: 안내 줄 · 머리 줄 · 사람마다 한 줄', () => {
    const ws = bulkTemplate(members, bulkColumns(items), L).worksheets[0];
    expect(ws.getRow(2).values).toEqual([undefined, '사번', '이름', '지급 · 상여금 [BONUS]', '공제 · 가불 [ADVANCE]']);
    expect(ws.rowCount).toBe(5);
  });
  it('읽기: 사번으로 찾고, 사번이 없으면 이름으로, 빈 칸은 건너뛰고, 쉼표 허용', () => {
    const cols = bulkColumns(items);
    const rows = [['빈 칸은 그대로'], ['사번', '이름', '지급 · 상여금 [BONUS]', '공제 · 가불 [ADVANCE]'], ['M001', '김가', '300,000', ''], ['', '박다', '', '50000'], ['M009', '모름', '1', ''], ['M002', '이나', '-5', 'x'], ['', '', '', '']];
    expect(readBulk(rows, cols, members, L)).toEqual([
      { row: 3, employeeNo: 'M001', name: '김가', employeeId: 'a', cells: [{ code: 'BONUS', kind: 'PAYMENT', amount: 300000 }], error: null },
      { row: 4, employeeNo: '', name: '박다', employeeId: 'c', cells: [{ code: 'ADVANCE', kind: 'DEDUCTION', amount: 50000 }], error: null },
      { row: 5, employeeNo: 'M009', name: '모름', employeeId: null, cells: [{ code: 'BONUS', kind: 'PAYMENT', amount: 1 }], error: 'unknown_employee' },
      { row: 6, employeeNo: 'M002', name: '이나', employeeId: 'b', cells: [], error: 'bad_amount' },
    ]);
    expect(readBulk([['아무것도']], cols, members, L)).toBeNull();
  });
});
