// 급여 설정의 순수 함수 검사 (PRD v1.3 17 · 20 · 25장).
// 세액 사례는 수집기 교차검수 보고서의 재현 예(3,370,000원 · 가족 3 · 자녀 1 · 80% → 24,540원)와 PRD 20장의 합성 사례 C07 · C08이다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManual, canonical, estimateTax, mapCollector, parseBands, pctToRate, pickAt, rateToPct, type ChildRule, type TaxRules } from '@/lib/payroll/reference';
import { payDateFor, STANDARD_ALLOWANCES, STANDARD_ITEMS, validateAllowance, validateItem, validateSetting } from '@/lib/payroll/settings';

describe('급여대장 설정', () => {
  it('지급 예정일: 말일 · 고정일 · 없는 날짜는 말일 · 익월 · 해 넘김', () => {
    expect(payDateFor('2026-02', { payMonth: 'CURRENT', payDayMode: 'MONTH_END', payDay: null })).toBe('2026-02-28');
    expect(payDateFor('2028-02', { payMonth: 'CURRENT', payDayMode: 'MONTH_END', payDay: null })).toBe('2028-02-29');
    expect(payDateFor('2026-02', { payMonth: 'CURRENT', payDayMode: 'FIXED_DAY', payDay: 31 })).toBe('2026-02-28');
    expect(payDateFor('2026-10', { payMonth: 'NEXT', payDayMode: 'FIXED_DAY', payDay: 10 })).toBe('2026-11-10');
    expect(payDateFor('2026-12', { payMonth: 'NEXT', payDayMode: 'FIXED_DAY', payDay: 10 })).toBe('2027-01-10');
  });

  it('형식 검사: 빈 칸과 0을 구분하고, 정해지지 않은 값을 임의로 채우지 않는다', () => {
    expect(validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'FIXED_DAY', payDay: '10', holidayShift: '', insuranceBasis: 'NOTICE', withholdingRatio: '100' })).toEqual({ ok: true, value: { payMonth: 'NEXT', payDayMode: 'FIXED_DAY', payDay: 10, holidayShift: null, insuranceBasis: 'NOTICE', withholdingRatio: 100, deductUnpaidLeave: false, deductLateness: false, premiumTimeBasis: 'ACTUAL' } });
    expect(validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'FIXED_DAY', payDay: '', insuranceBasis: 'NOTICE', withholdingRatio: 100 }).ok).toBe(false); // 고정일인데 날짜 없음
    // 보험마다 따로 (2026-10-20): 빈 칸 · 기본과 같은 값은 저장하지 않는다, 모르는 보험 이름은 거절
    const each = validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'MONTH_END', holidayShift: '', insuranceBasis: 'PAYROLL_BASE', withholdingRatio: 100, insuranceBasisOf: { pension: 'REPORTED_BASE', health: 'REPORTED_BASE', employment: 'PAYROLL_BASE' } });
    expect(each.ok && (each.value as { insuranceBasisOf?: unknown }).insuranceBasisOf).toEqual({ pension: 'REPORTED_BASE', health: 'REPORTED_BASE' });
    const blank = validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'MONTH_END', holidayShift: '', insuranceBasis: 'PAYROLL_BASE', withholdingRatio: 100, insuranceBasisOf: { pension: null, health: '', employment: null } });
    expect(blank.ok && 'insuranceBasisOf' in blank.value).toBe(false);
    expect(validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'MONTH_END', holidayShift: '', insuranceBasis: 'PAYROLL_BASE', withholdingRatio: 100, insuranceBasisOf: { accident: 'NOTICE' } }).ok).toBe(false);
    expect(validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'MONTH_END', holidayShift: '', insuranceBasis: 'PAYROLL_BASE', withholdingRatio: 100, insuranceBasisOf: { pension: 'ACTUAL' } }).ok).toBe(false);
    expect(validateSetting('ledger', { payMonth: 'NEXT', payDayMode: 'MONTH_END', insuranceBasis: 'NOTICE', withholdingRatio: 90 }).ok).toBe(false); // 80·100·120만
    expect(validateSetting('working-time', { weeklyHours: 40, weeklyOvertimeLimit: 12, monthlyHours: '' })).toEqual({ ok: true, value: { weeklyHours: 40, weeklyOvertimeLimit: 12, monthlyHours: null } });
    expect(validateSetting('working-time', { weeklyHours: 40, weeklyOvertimeLimit: 12, monthlyHours: 0 }).ok).toBe(false); // 분모 0 금지
    expect(validateSetting('employee-defaults', { payType: '', durunuri: false, smeTaxCut: false })).toEqual({ ok: true, value: { payType: null, durunuri: false, smeTaxCut: false } });
    expect(validateSetting('masking', { unmaskMinutes: 0 }).ok).toBe(false);
  });
});

describe('지급 · 공제 항목', () => {
  const base = { code: 'meal', kind: 'PAYMENT', koName: '식대', enName: 'Meal', calcKind: 'FIXED', taxTreatment: 'PARTIAL', ordinaryWage: 'INCLUDED' };
  it('코드는 대문자로, 금액의 쉼표는 떼고, 빈 금액은 null(0이 아님)', () => {
    const r = validateItem({ ...base, defaultAmount: '200,000', taxExemptLimit: '200000' });
    expect(r.ok && r.value).toMatchObject({ code: 'MEAL', defaultAmount: 200000, taxExemptLimit: 200000 });
    const e = validateItem({ ...base, defaultAmount: '' });
    expect(e.ok && e.value.defaultAmount).toBeNull();
  });
  it('과세 항목에 비과세 한도를 넣을 수 없고, 공제 항목에는 과세 구분이 없다', () => {
    expect(validateItem({ ...base, taxTreatment: 'TAXABLE', taxExemptLimit: '100000' }).ok).toBe(false);
    const d = validateItem({ ...base, kind: 'DEDUCTION', taxTreatment: 'TAXABLE' });
    expect(d.ok && d.value.taxTreatment).toBe('NOT_APPLICABLE');
    expect(validateItem({ ...base, code: 'a b' }).ok).toBe(false);
    expect(validateItem({ ...base, defaultAmount: '-1' }).ok).toBe(false);
  });
  it('통상 항목: 코드가 겹치지 않고 전부 형식 검사를 통과하며 금액을 넣지 않는다', () => {
    expect(new Set(STANDARD_ITEMS.map((x) => x.code)).size).toBe(STANDARD_ITEMS.length);
    for (const x of STANDARD_ITEMS) {
      expect(validateItem({ ...x }).ok, x.code).toBe(true);
      expect(x.defaultAmount).toBeNull();
    }
    expect(STANDARD_ITEMS.find((x) => x.code === 'BASE_PAY')?.ordinaryWage).toBe('INCLUDED');
  });
});

describe('법정수당의 회사 기준', () => {
  it('가산율은 소수 4자리까지, 3 이하', () => {
    expect(validateAllowance({ premium: '0.5', premiumOver8h: '', note: '' })).toEqual({ ok: true, value: { premium: '0.5', premiumOver8h: null, note: null } });
    expect(validateAllowance({ premium: '50' }).ok).toBe(false);
    expect(validateAllowance({ premium: '0.12345' }).ok).toBe(false);
  });
  it('통상 기준: 휴일근로는 8시간 이내 50% · 초과분 100% (전부 50%로 두지 않는다)', () => {
    expect(STANDARD_ALLOWANCES.holiday).toMatchObject({ premium: '0.5', premiumOver8h: '1' });
    expect(STANDARD_ALLOWANCES.overtime.premium).toBe('0.5');
  });
});

describe('요율 글자 변환', () => {
  it('퍼센트 ↔ 소수 비율 (부동소수 오차 없이)', () => {
    for (const [pct, rate] of [['0.9', '0.009'], ['4.75', '0.0475'], ['7.19', '0.0719'], ['3.595', '0.03595'], ['0.9448', '0.009448'], ['13.14', '0.1314']]) {
      expect(pctToRate(pct)).toBe(rate);
      expect(rateToPct(rate)).toBe(pct);
    }
    expect(pctToRate('abc')).toBeNull();
    expect(pctToRate('')).toBeNull();
  });
  it('직접 입력: 빈 필수 칸은 거부(0으로 채우지 않음), 상한은 하한보다 커야 한다', () => {
    expect(buildManual('employment.rate', { employeeRate: '0.9', employerRate: '0.9' })).toEqual({ employeeRate: '0.009', employerRate: '0.009' });
    expect(buildManual('employment.rate', { employeeRate: '0.9', employerRate: '' })).toBeNull();
    expect(buildManual('pension.limit', { lower: '6,370,000', upper: '400000' })).toBeNull();
    expect(buildManual('income-tax.child-adjust', { child1: '20830' })).toEqual({ child1: 20830, child2: null, perExtraChild: null });
    expect(buildManual('income-tax.table', {})).toBeNull(); // 세액표는 손으로 넣지 않는다
  });
});

describe('소득세 조회', () => {
  const rules: TaxRules = { wageMin: 770000, wageMaxExclusive: 10000000, topRow: null, highBands: null, family11Rule: false };
  const row = (first: number) => [first, ...Array(10).fill(0)] as number[];
  const at = (taxes: number[], family: number, children: number, ratio: number, childRule: ChildRule | null = null) => estimateTax({ wage: 3370000, family, children, ratio, bandTaxes: taxes, rules, childRule });
  it('교차검수 재현: 표 세액 51,510 − 자녀 1명 20,830 → 80% → 24,540원, 지방소득세 2,450원', () => {
    expect(at([0, 0, 51510, 0, 0, 0, 0, 0, 0, 0, 0], 3, 1, 80, { child1: 20830, child2: 45830, perExtraChild: 33330 })).toEqual({ ok: true, baseTax: 51510, childAdjust: 20830, afterChild: 30680, ratio: 80, incomeTax: 24540, localTax: 2450, how: 'table' });
  });
  it('C08 합성: 기본세액 10,000원 · 80% → 8,000원 · 지방 800원', () => {
    expect(at(row(10000), 1, 0, 80)).toMatchObject({ ok: true, incomeTax: 8000, localTax: 800 });
  });
  it('표에 줄이 없거나 규칙 없는 자녀 수는 계산하지 않는다 (마지막 줄이나 0으로 대신하지 않음)', () => {
    expect(estimateTax({ wage: 3370000, family: 1, children: 0, ratio: 100, bandTaxes: null, rules, childRule: null })).toEqual({ ok: false, why: 'no_row' });
    expect(at(row(50000), 1, 1, 100)).toEqual({ ok: false, why: 'no_child_rule' });
    expect(at(row(50000), 1, 2, 100, { child1: 20830, child2: null, perExtraChild: null })).toEqual({ ok: false, why: 'no_child_rule' });
    expect(at(row(50000), 1, 0, 90)).toEqual({ ok: false, why: 'invalid_input' });
    expect(estimateTax({ wage: 12000000, family: 1, children: 0, ratio: 100, bandTaxes: null, rules, childRule: null })).toEqual({ ok: false, why: 'no_high_rule' });
    expect(at(row(50000), 12, 0, 100)).toEqual({ ok: false, why: 'no_family_rule' });
  });
  it('자녀 공제: 2명 · 3명 이상(2명 초과 1명당) · 공제가 세액보다 크면 0원', () => {
    const rule = { child1: 20830, child2: 45830, perExtraChild: 33330 };
    expect(at(row(100000), 1, 2, 100, rule)).toMatchObject({ ok: true, childAdjust: 45830, incomeTax: 54170 });
    expect(at(row(200000), 1, 4, 100, rule)).toMatchObject({ ok: true, childAdjust: 112490, incomeTax: 87510 });
    expect(at(row(1000), 1, 1, 100, rule)).toMatchObject({ ok: true, afterChild: 0, incomeTax: 0, localTax: 0 });
  });
  it('표의 첫 구간보다 적은 급여는 0원', () => {
    expect(estimateTax({ wage: 500000, family: 1, children: 0, ratio: 100, bandTaxes: null, rules, childRule: null })).toMatchObject({ ok: true, incomeTax: 0, how: 'below_table' });
  });
  it('C07 합성 경계: [1,000,000, 1,100,000) 1,000원 · 다음 구간 2,000원 — 구간은 빈틈없이 이어져야 한다', () => {
    const dash = ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'];
    const one = (n: string) => [n, ...dash.slice(1)];
    const ok = parseBands([{ from_krw: 1000000, to_krw_exclusive: 1100000, tax_by_family_1_to_11_raw: one('1,000') }, { from_krw: 1100000, to_krw_exclusive: 1200000, tax_by_family_1_to_11_raw: one('2,000') }]);
    expect(ok.ok && ok.bands.map((b) => b.taxes[0])).toEqual([1000, 2000]);
    expect(ok.ok && ok.bands[0].taxes[1]).toBe(0); // 「-」는 세액 없음
    expect(parseBands([{ from_krw: 1000000, to_krw_exclusive: 1100000, tax_by_family_1_to_11_raw: one('1,000') }, { from_krw: 1150000, to_krw_exclusive: 1200000, tax_by_family_1_to_11_raw: one('2,000') }])).toEqual({ ok: false, why: 'bands_gap' });
    expect(parseBands([{ from_krw: 1, to_krw_exclusive: 2, tax_by_family_1_to_11_raw: ['x', ...dash.slice(1)] }])).toEqual({ ok: false, why: 'bands_format' });
  });
});

describe('적용일로 판 고르기', () => {
  const list = [{ validFrom: '2025-07-01', validTo: '2026-07-01', v: 'a' }, { validFrom: '2026-07-01', validTo: null, v: 'b' }, { validFrom: null, validTo: null, v: 'x' }];
  it('C10: 공표된 미래 자료는 시행일 전에 쓰지 않는다 · 시행일을 모르는 자료는 쓰지 않는다 · 없는 기간은 null', () => {
    expect(pickAt(list, '2026-06-30')?.v).toBe('a');
    expect(pickAt(list, '2026-07-01')?.v).toBe('b');
    expect(pickAt(list, '2025-06-30')).toBeNull();
  });
});

describe('수집기 결과 → 검토 후보', () => {
  const dir = path.join(import.meta.dirname, '..', '..', '..', '공식자료 수집 검증', 'data');
  const has = existsSync(path.join(dir, 'latest.json'));
  it.skipIf(!has)('실제 수집 파일: 읽은 값만 후보가 되고, 실패한 출처는 건너뛴 이유가 남는다', () => {
    const latest = JSON.parse(readFileSync(path.join(dir, 'latest.json'), 'utf8'));
    const bandsFile = readdirSync(path.join(dir, 'parsed')).find((f) => f.startsWith('tax-bands-'))!;
    const bands = JSON.parse(readFileSync(path.join(dir, 'parsed', bandsFile), 'utf8'));
    const { candidates, skipped } = mapCollector(latest, bands);
    const of = (k: string) => candidates.filter((c) => c.kind === k);
    expect(of('health.rate')[0].payload).toMatchObject({ totalRate: '0.0719', employeeRate: '0.03595', employerRate: '0.03595' });
    expect(of('health.rate')[0].validFrom).toBeNull(); // 원문에 시행일이 없다 — 관리자가 넣어야 한다
    expect(of('ltc.rate')[0].payload).toMatchObject({ incomeRate: '0.009448' });
    expect(of('pension.rate')[0].payload).toEqual({ employeeRate: '0.0475', employerRate: '0.0475' });
    expect(of('pension.limit').map((c) => [c.validFrom, c.validTo, c.payload.lower, c.payload.upper])).toEqual([['2025-07-01', '2026-07-01', 400000, 6370000], ['2026-07-01', '2027-07-01', 410000, 6590000]]);
    expect(of('accident.commute')[0].payload).toMatchObject({ perThousand: '0.6', rate: '0.0006' });
    expect(of('minimum-wage')[0].payload).toMatchObject({ hourly: 10320, monthly209: 2156880 });
    expect(of('maternity.limit')[0]).toMatchObject({ validFrom: '2026-01-01', payload: { monthlyLimit: 2200000 } });
    expect(of('income-tax.child-adjust')[0]).toMatchObject({ validFrom: '2026-03-01', payload: { child1: 20830, child2: null } });
    const table = of('income-tax.table')[0];
    expect(table.bands?.length).toBe(646);
    // 교차검수 보고서의 표 값: 1,060,000~1,065,000 가족 1명 1,040원 / 3,370,000원 가족 3명 51,510원
    expect(table.bands!.find((b) => b.wageFrom === 1060000)?.taxes[0]).toBe(1040);
    expect(table.bands!.find((b) => b.wageFrom <= 3370000 && 3370000 < b.wageTo!)?.taxes[2]).toBe(51510);
    expect(of('employment.rate')).toEqual([]); // 수집기에 파서가 없다 — 만들어 내지 않는다
    expect(skipped.map((s) => s.source)).toContain('nts_direct_probe');
  });
  it('형식이 다른 파일은 후보를 만들지 않는다', () => {
    expect(mapCollector({ nope: 1 }, null)).toEqual({ candidates: [], skipped: [{ source: 'latest.json', why: 'format' }] });
    expect(mapCollector({ results: [{ source_id: 'health', status: 'EXTRACTED', values: { health_total_rate: '7.19' } }] }, null).candidates).toEqual([]); // 퍼센트 그대로 온 값(100배)은 거부
  });
  it('같은 값은 키 순서가 달라도 같은 글자가 된다 (해시용)', () => {
    expect(canonical({ b: 1, a: { d: null, c: [2, 1] } })).toBe(canonical({ a: { c: [2, 1], d: null }, b: 1 }));
  });
});
