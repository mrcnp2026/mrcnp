// 외국인 직원 (묶음 31, 2026-10-20 의뢰인: 태국 · 베트남) — 입력 검사 · 보험 제안 · 단일세율 19% · 출국만기보험 차액 · 체류 기간 알림 단계.
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanForeign, daysToStayEnd, EMPTY_FOREIGN, suggestForeign } from '@/lib/foreign-rules';
import { reliefsForMonth, validateReliefs } from '@/lib/payroll/contract';
import { calculateStatement, type EngineInput, type EngineTax } from '@/lib/payroll/engine/engine';
import { calcRetirement, toRetirementInput } from '@/lib/payroll/retirement';
import { stayStage } from '@/lib/stay-alerts';

const TODAY = '2026-10-20';

describe('외국인 정보 입력 검사', () => {
  it('나라 코드 · 체류 자격은 대문자로 맞추고, 내국인이면 나머지를 버린다', () => {
    expect(cleanForeign({ nationality: 'th', visaType: 'e-9', stayUntil: '2027-03-01', firstWorkInKorea: '2024-05-01' }, TODAY)).toEqual({ nationality: 'TH', visaType: 'E-9', stayUntil: '2027-03-01', firstWorkInKorea: '2024-05-01' });
    expect(cleanForeign({ nationality: '', visaType: 'E-9' }, TODAY)).toEqual(EMPTY_FOREIGN);
    expect(cleanForeign({ nationality: 'KR', visaType: 'E-9' }, TODAY)).toEqual(EMPTY_FOREIGN);
  });
  it('틀린 값은 거절한다', () => {
    expect(cleanForeign({ nationality: 'THA' }, TODAY)).toEqual({ error: 'foreign_nationality' });
    expect(cleanForeign({ nationality: 'VN', visaType: '9E' }, TODAY)).toEqual({ error: 'foreign_visa' });
    expect(cleanForeign({ nationality: 'VN', stayUntil: '2027-02-30' }, TODAY)).toEqual({ error: 'foreign_stay' });
    expect(cleanForeign({ nationality: 'VN', firstWorkInKorea: '2027-01-01' }, TODAY)).toEqual({ error: 'foreign_first_work' });
  });
});

describe('보험 · 세금 제안 (제안만 — 자동으로 바꾸지 않는다)', () => {
  it('E-9 태국: 건강 · 산재 가입, 고용은 본인 신청, 국민연금은 공단 확인, 출국만기보험', () => {
    const s = suggestForeign({ nationality: 'TH', visaType: 'E-9', stayUntil: null, firstWorkInKorea: '2024-05-01' }, TODAY)!;
    expect(s).toEqual({ pension: 'CHECK', health: 'YES', employment: 'ON_REQUEST', accident: 'YES', flatTax: 'ELIGIBLE', departureInsurance: true });
  });
  it('F-6 베트남: 고용보험은 내국인과 같다, 출국만기보험 없음', () => {
    const s = suggestForeign({ nationality: 'VN', visaType: 'F-6', stayUntil: null, firstWorkInKorea: null }, TODAY)!;
    expect([s.employment, s.departureInsurance, s.flatTax]).toEqual(['YES', false, 'NEED_FIRST_WORK']);
  });
  it('단일세율 19%: 2027년 처음 일했거나 20년이 지나면 대상 아님', () => {
    expect(suggestForeign({ nationality: 'VN', visaType: 'E-9', stayUntil: null, firstWorkInKorea: '2005-03-01' }, TODAY)!.flatTax).toBe('NOT_ELIGIBLE'); // 2005~2024가 20년
    expect(suggestForeign({ nationality: 'VN', visaType: 'E-9', stayUntil: null, firstWorkInKorea: '2007-03-01' }, TODAY)!.flatTax).toBe('ELIGIBLE'); // 2026은 20번째 해
    expect(suggestForeign(EMPTY_FOREIGN, TODAY)).toBeNull();
  });
});

describe('체류 기간 남은 날 · 알림 단계', () => {
  it('남은 날', () => {
    expect([daysToStayEnd('2026-12-19', TODAY), daysToStayEnd('2026-10-19', TODAY), daysToStayEnd(null, TODAY)]).toEqual([60, -1, null]);
  });
  it('60일 → 30일 → 지남 순으로 한 번씩', () => {
    expect([stayStage(90), stayStage(60), stayStage(45), stayStage(30), stayStage(1), stayStage(0), stayStage(-3), stayStage(null)]).toEqual([null, 60, 60, 30, 30, 30, 0, null]);
  });
});

describe('단일세율 19% 입력 · 그 달 적용', () => {
  it('「예」는 시작일 · 근거가 있어야 한다, 보내지 않으면 「아니오」', () => {
    expect(validateReliefs({ flat19: { state: 'YES', from: '2026-03-01', note: null } })).toEqual({ ok: false, code: 'tax_relief_flat19' });
    const ok = validateReliefs({ flat19: { state: 'YES', from: '2026-03-01', note: '2026-03-05 신청서 제출' } });
    expect(ok.ok && ok.value.flat19).toEqual({ state: 'YES', from: '2026-03-01', to: null, note: '2026-03-05 신청서 제출' });
    const none = validateReliefs({});
    expect(none.ok && none.value.flat19?.state).toBe('NO');
  });
  it('기간이 걸치는 달만, 예전 판(flat19 없음)은 아니오, 중소기업 감면과 함께면 막는다', () => {
    const off = { sme: false, durunuri: false };
    expect(reliefsForMonth({ flat19: { state: 'YES', from: '2026-03-01', to: null, note: 'x' } }, off, '2026-02-01', '2026-02-28').reliefs.flat19).toBe(false);
    expect(reliefsForMonth({ flat19: { state: 'YES', from: '2026-03-01', to: null, note: 'x' } }, off, '2026-03-01', '2026-03-31').reliefs.flat19).toBe(true);
    expect(reliefsForMonth({}, off, '2026-03-01', '2026-03-31').reliefs.flat19).toBe(false);
    const both = reliefsForMonth({ flat19: { state: 'YES', from: '2026-01-01', to: null, note: 'x' }, sme: { state: 'YES', rate: 90, from: '2026-01-01', to: null, note: 'x' } }, { sme: true, durunuri: false }, '2026-03-01', '2026-03-31');
    expect(both.blockers).toEqual([{ code: 'flat19_with_sme', detail: 'sme' }]);
  });
});

describe('계산: 단일세율 19% (engine-1.6)', () => {
  const ins = (state: 'YES' | 'NO') => ({ state, reportedWage: null });
  const tax = (flat19: boolean): EngineTax => ({ withholdingRatio: 100, familyCount: 1, childCount: 0, insurance: { pension: ins('NO'), health: ins('NO'), employment: ins('NO'), accident: ins('NO') }, studentLoan: { state: 'NO', monthlyAmount: null }, reliefs: { smeRate: null, durunuri: null, flat19 } });
  const input = (flat19: boolean): EngineInput => ({
    runKind: 'REGULAR',
    contract: { payType: 'MONTHLY', amount: 2_500_000, monthlyHours: 209, annualDivisor: null, included: { overtimeHours: null, holidayHours: null } },
    tax: tax(flat19),
    time: { workedMinutes: 0, overtimeMinutes: 0, nightMinutes: 0, holidayMinutes: 0, holidayOver8Minutes: 0, paidLeaveMinutes: 0 },
    partialMonth: false,
    items: [{ code: 'MEAL', kind: 'PAYMENT', label: 'MEAL', amount: 200_000, taxable: 'PARTIAL', exemptLimit: 200_000, insurable: true }],
    policy: { overtimePremium: '0.5', nightPremium: '0.5', holidayPremium: '0.5', holidayOver8Premium: '1', rounding: { pay: { mode: 'HALF_UP', unit: 1 }, insurance: { mode: 'HALF_UP', unit: 1 } } },
    reference: { pension: null, health: null, ltcOfHealth: null, employment: null, accidentEmployerRate: null },
    insuranceBasis: 'PAYROLL_BASE',
    withholding: () => ({ ok: true, incomeTax: 11_111, localTax: 1_110 }),
    overrides: [],
  });
  it('비과세 식대까지 지급 전액 270만 × 19% = 513,000, 지방소득세 51,300 — 세액표는 쓰지 않는다', () => {
    const r = calculateStatement(input(true));
    if (r.state !== 'OK') throw new Error(JSON.stringify(r.blockers));
    const amt = (c: string) => r.lines.find((l) => l.code === c)?.amount;
    expect([amt('INCOME_TAX'), amt('LOCAL_TAX')]).toEqual([513_000, 51_300]);
    expect(r.totals.taxable).toBe(2_700_000);
    expect(r.warnings).toContainEqual({ code: 'flat19_applied' });
  });
  it('19%가 아니면 예전처럼 세액표', () => {
    const r = calculateStatement(input(false));
    if (r.state !== 'OK') throw new Error(JSON.stringify(r.blockers));
    expect(r.lines.find((l) => l.code === 'INCOME_TAX')?.amount).toBe(11_111);
  });
});

describe('퇴직 정산: 출국만기보험 차액', () => {
  const base = { periodFrom: '2024-01-01', periodTo: '2025-12-31', excludedDays: 0, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null };
  it('보험금이 적으면 회사가 차액을 준다, 많으면 0, 넣지 않으면 차액 줄이 없다', () => {
    const full = calcRetirement(base).amount!;
    expect(calcRetirement({ ...base, departureInsurance: full - 500_000 }).companyPays).toBe(500_000);
    expect(calcRetirement({ ...base, departureInsurance: full + 1 }).companyPays).toBe(0);
    expect('companyPays' in calcRetirement(base)).toBe(false);
  });
  it('저장된 값에서 읽는다', () => {
    expect(toRetirementInput({ ...base, departureInsurance: '1,234,000' }).departureInsurance).toBe(1_234_000);
  });
});
