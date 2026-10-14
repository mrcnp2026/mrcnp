// 인건비 현황의 더하기 규칙 — 판 고르기(정정본만 센다)와 달 · 부서 · 직원 합계
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/org-data', () => ({ loadOrgGroups: async () => [] }));

const { pickRevisions, sumLabor } = await import('@/lib/payroll/labor-cost');
type Row = Parameters<typeof sumLabor>[0][number];
const row = (o: Partial<Row>): Row => ({ runId: 'r', kind: 'REGULAR', month: '2026-09', final: true, employeeId: 'a', groupId: 'g1', pay: 0, deduction: 0, net: 0, employer: 0, ...o });
const people = new Map([['a', { name: '가', employeeNo: '1' }], ['b', { name: '나', employeeNo: '2' }]]);
const groupName = (id: string | null) => id ?? '미배정';

describe('pickRevisions', () => {
  const run = (o: object) => ({ kind: 'REGULAR', periodFrom: '2026-09-01', periodTo: '2026-10-01', sequence: 1, revision: 1, ...o });
  it('같은 대장은 가장 높은 판 하나만 고른다', () => {
    const out = pickRevisions([run({ revision: 1 }), run({ revision: 3 }), run({ revision: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0].revision).toBe(3);
  });
  it('달 · 종류 · 차수가 다르면 따로 센다', () => {
    expect(pickRevisions([run({}), run({ kind: 'BONUS' }), run({ kind: 'BONUS', sequence: 2 }), run({ periodFrom: '2026-10-01', periodTo: '2026-11-01' })])).toHaveLength(4);
  });
});

describe('sumLabor', () => {
  const rows = [
    row({ employeeId: 'a', month: '2026-09', pay: 3_000_000, deduction: 300_000, net: 2_700_000, employer: 320_000 }),
    row({ employeeId: 'b', month: '2026-09', groupId: null, pay: 2_000_000, deduction: 200_000, net: 1_800_000, employer: 210_000 }),
    row({ employeeId: 'a', month: '2026-10', kind: 'BONUS', pay: 500_000, deduction: 50_000, net: 450_000, employer: 0 }),
  ];
  const r = sumLabor(rows, people, groupName);
  it('총인건비 = 지급 합계 + 사업주 부담 (실지급과 다르다)', () => {
    expect(r.total).toMatchObject({ statements: 3, people: 2, pay: 5_500_000, deduction: 550_000, net: 4_950_000, employer: 530_000, total: 6_030_000 });
  });
  it('달 · 부서 · 직원의 합이 전체 합과 같다', () => {
    for (const part of [r.months, r.groups, r.employees]) {
      expect(part.reduce((s, x) => s + x.total, 0)).toBe(r.total.total);
      expect(part.reduce((s, x) => s + x.net, 0)).toBe(r.total.net);
      expect(part.reduce((s, x) => s + x.statements, 0)).toBe(3);
    }
  });
  it('달은 앞에서부터, 부서 없는 직원은 미배정으로 묶는다', () => {
    expect(r.months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(r.groups.find((g) => g.groupId === null)).toMatchObject({ name: '미배정', people: 1, pay: 2_000_000 });
    expect(r.groups.find((g) => g.groupId === 'g1')).toMatchObject({ people: 1, statements: 2 });
  });
  it('자료가 없으면 전부 0이고 줄이 없다', () => {
    const e = sumLabor([], people, groupName);
    expect(e.total).toMatchObject({ statements: 0, people: 0, total: 0 });
    expect(e.months).toEqual([]);
  });
});

describe('직무별 · 항목별 (2026-10-14 인건비 표 확장)', async () => {
  const { sumByJob, sumItems } = await import('@/lib/payroll/labor-cost');
  it('직무별 합은 전체 합과 같고, 직무가 없는 사람은 「미배정」으로 묶는다', () => {
    const rows = [row({ employeeId: 'a', jobId: 'j1', pay: 100, employer: 10 }), row({ employeeId: 'b', jobId: null, pay: 200, employer: 20 }), row({ employeeId: 'a', jobId: 'j1', month: '2026-10', pay: 50 })];
    const jobs = sumByJob(rows, (id) => id ?? '미배정');
    expect(jobs.map((j) => [j.name, j.people, j.total])).toEqual([['미배정', 1, 220], ['j1', 1, 160]]);
    expect(jobs.reduce((s, j) => s + j.total, 0)).toBe(380);
  });
  it('항목별: 같은 코드끼리 더하고, 지급 먼저 · 금액이 큰 순, 받은 사람 수를 센다', () => {
    const items = sumItems([
      { kind: 'DEDUCTION', code: 'NP', label: '국민연금', amount: 10, employeeId: 'a' },
      { kind: 'PAYMENT', code: 'BASE', label: '기본급', amount: 100, employeeId: 'a' },
      { kind: 'PAYMENT', code: 'BASE', label: '기본급', amount: 200, employeeId: 'b' },
      { kind: 'PAYMENT', code: 'OT', label: '연장', amount: 50, employeeId: 'a' },
    ]);
    expect(items.map((x) => [x.kind, x.code, x.amount, x.people])).toEqual([['PAYMENT', 'BASE', 300, 2], ['PAYMENT', 'OT', 50, 1], ['DEDUCTION', 'NP', 10, 1]]);
  });
});
