// 공식자료 수집기의 읽기 검사 — 실제로 받아 둔 공식 원문으로 (PRD v1.3 29.3: 기관별 실제 성공 원문을 fixture로).
//   · 고용보험 · 건강보험 상하한: tests/fixtures/payroll/ (2026-10-13 받은 원문)
//   · 나머지: `공식자료 수집 검증/data/raw/` (2026-10-12 시험 프로그램이 받은 원문) — 폴더가 없으면 그 검사는 건너뛴다
// 기대값은 원문을 사람이 읽어 확인한 값이다(교차검수 보고서 · 고시 원문). 읽기 함수가 낸 값을 그대로 옮기지 않았다.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findAccidentNotice, findHwpxLink, pageText, ParseError, parseAccident, parseEmployment, parseHealth, parseHealthLimits, parseMaternity, parseMinimumWage, parsePension, parsePensionLimits, parseTaxAmendment, parseTaxTable, pct } from '@/lib/payroll/collector/parse';
import { asChildRule, asTaxRules, estimateTax } from '@/lib/payroll/reference';

const FIX = path.join(import.meta.dirname, 'fixtures', 'payroll');
const RAW = path.join(import.meta.dirname, '..', '..', '..', '공식자료 수집 검증');
const latestPath = path.join(RAW, 'data', 'latest.json');
const has = existsSync(latestPath);
type Req = { raw_file: string; content_type: string };
const reqs = (id: string): Req[] => (JSON.parse(readFileSync(latestPath, 'utf8')).results as { source_id: string; requests: Req[] }[]).find((r) => r.source_id === id)!.requests;
const bytes = (r: Req) => new Uint8Array(readFileSync(path.join(RAW, r.raw_file.replace(/\\/g, '/'))));
const text = (r: Req) => new TextDecoder(/charset=([\w-]+)/i.exec(r.content_type)?.[1] ?? 'utf-8').decode(bytes(r));

describe('고용보험 · 건강보험 상하한 (새로 넣은 출처)', () => {
  it('고용보험: 실업급여 근로자 0.9% · 사업주 0.9%, 고용안정 · 직능 4구간', () => {
    const [c] = parseEmployment(readFileSync(path.join(FIX, 'employment.html'), 'utf8'));
    expect(c.kind).toBe('employment.rate');
    expect(c.payload).toEqual({ employeeRate: '0.009', employerRate: '0.009', stabilityUnder150: '0.0025', stabilityPriority150: '0.0045', stability150to1000: '0.0065', stabilityOver1000: '0.0085' });
    expect(c.validFrom).toBeNull(); // 원문에 시행일이 없다 — 관리자가 넣어야 한다
  });
  it('건강보험료 상하한: 고시 제2025-222호 · 2026-01-01 시행 · 상한 9,183,480원(근로자 4,591,740원) · 하한 20,160원', () => {
    const [c] = parseHealthLimits(readFileSync(path.join(FIX, 'health-limits.html'), 'utf8'));
    expect(c).toMatchObject({ kind: 'health.limit', validFrom: '2026-01-01', payload: { premiumUpper: 9183480, premiumUpperEmployee: 4591740, premiumLower: 20160, incomePremiumUpper: 4591740, noticeNo: '2025-222' } });
  });
  it('글 모양이 달라지면 값을 추정하지 않고 멈춘다', () => {
    expect(() => parseEmployment('<html><body>점검 중입니다</body></html>')).toThrow(ParseError);
    expect(() => parseHealthLimits('<html><body>로그인이 필요합니다</body></html>')).toThrow(ParseError);
    expect(() => parseHealth('<p>2026년도 보험료율 직장가입자 건강보험료율: 7.19%</p>')).toThrow(ParseError); // 장기요양 · 분담 문구가 없다
    expect(() => pct('719')).toThrow(ParseError); // 100배 틀린 값
  });
});

describe.skipIf(!has)('시험 프로그램이 받아 둔 원문', () => {
  it('건강보험 · 장기요양', () => {
    const [h, l] = parseHealth(text(reqs('health')[0]));
    expect(h.payload).toMatchObject({ totalRate: '0.0719', employeeRate: '0.03595', employerRate: '0.03595', documentYear: 2026 });
    expect(l.payload).toMatchObject({ incomeRate: '0.009448', healthRate: '0.0719' });
  });
  it('국민연금 요율과 기간별 상하한', () => {
    expect(parsePension(text(reqs('pension')[0]))[0].payload).toEqual({ employeeRate: '0.0475', employerRate: '0.0475' });
    expect(parsePensionLimits(text(reqs('pension_limits')[0])).map((c) => [c.validFrom, c.validTo, c.payload.lower, c.payload.upper])).toEqual([['2025-07-01', '2026-07-01', 400000, 6370000], ['2026-07-01', '2027-07-01', 410000, 6590000]]);
  });
  it('최저임금 · 출산전후휴가 상한', () => {
    expect(parseMinimumWage(text(reqs('minimum_wage')[0]))[0]).toMatchObject({ validFrom: '2026-01-01', validTo: '2027-01-01', payload: { hourly: 10320, monthly209: 2156880 } });
    expect(parseMaternity(text(reqs('maternity')[0]))[0]).toMatchObject({ validFrom: '2026-01-01', payload: { monthlyLimit: 2200000 } });
  });
  it('산재보험: 목록에서 최신 고시 찾기 → 첨부 → 출퇴근 재해 0.6/1,000', async () => {
    const r = reqs('accident');
    const notice = findAccidentNotice(text(r[0]));
    expect(notice?.year).toBe(2026);
    expect(findHwpxLink(text(r[1]))).toContain('file_ext=hwpx');
    expect((await parseAccident(bytes(r.at(-1)!), 2026))[0]).toMatchObject({ validFrom: '2026-01-01', payload: { perThousand: '0.6', rate: '0.0006' } });
    expect(findAccidentNotice('<a href="view.do?x=1">2019년도 다른 고시</a>')).toBeNull();
  });
  it('개정문: 자녀 공제 1명 20,830원 · 2명 45,830원 · 3명부터 1명당 33,330원, 2026-03-01 시행', () => {
    expect(parseTaxAmendment(text(reqs('tax_amendment_probe')[0]))[0]).toMatchObject({ validFrom: '2026-03-01', payload: { child1: 20830, child2: 45830, perExtraChild: 33330, previousChild1: 12500, previousChild2: 29160, previousPerExtraChild: 25000 } });
  });

  it('간이세액표: 646구간 + 1,000만원 줄 + 고액 6구간 식 + 가족 11명 초과 규칙 + 표 원문의 자녀 공제(2024)', async () => {
    const [table, child] = await parseTaxTable(bytes(reqs('tax').at(-1)!), '20240229');
    expect(table.bands?.length).toBe(646);
    expect(table.bands!.find((b) => b.wageFrom === 1060000)?.taxes[0]).toBe(1040); // 교차검수 보고서의 표 값
    const p = table.payload;
    expect(p).toMatchObject({ wageMin: 770000, wageMaxExclusive: 10000000, family11Rule: true, revisedOn: '2024-02-29' });
    expect(p.topRow).toEqual([1507400, 1431570, 1200840, 1170840, 1140840, 1110840, 1080840, 1050840, 1020840, 990840, 960840]); // 원문 「10,000천원」 줄
    expect(p.highBands).toEqual([
      { over: 10000000, upTo: 14000000, fixed: 25000, pct98: true, ratePct: 35 },
      { over: 14000000, upTo: 28000000, fixed: 1397000, pct98: true, ratePct: 38 },
      { over: 28000000, upTo: 30000000, fixed: 6610600, pct98: true, ratePct: 40 },
      { over: 30000000, upTo: 45000000, fixed: 7394600, pct98: false, ratePct: 40 },
      { over: 45000000, upTo: 87000000, fixed: 13394600, pct98: false, ratePct: 42 },
      { over: 87000000, upTo: null, fixed: 31034600, pct98: false, ratePct: 45 },
    ]);
    expect(child).toMatchObject({ kind: 'income-tax.child-adjust', validFrom: null, payload: { child1: 12500, child2: 29160, perExtraChild: 25000 } });

    // 읽은 규칙으로 조회 — 기대값은 원문의 식을 손으로 계산한 것
    const rules = asTaxRules(p)!;
    const band = (w: number) => table.bands!.find((b) => b.wageFrom <= w && w < b.wageTo!)?.taxes ?? null;
    const rule2026 = asChildRule({ child1: 20830, child2: 45830, perExtraChild: 33330 });
    const q = (wage: number, family: number, children = 0, ratio = 100) => estimateTax({ wage, family, children, ratio, bandTaxes: band(wage), rules, childRule: rule2026 });
    expect(q(3370000, 3, 1, 80)).toMatchObject({ ok: true, baseTax: 51510, incomeTax: 24540 }); // 교차검수 보고서의 재현 예
    expect(q(10000000, 1)).toMatchObject({ ok: true, incomeTax: 1507400, how: 'top_row' });
    // 1,200만원 · 가족 1: 1,507,400 + 25,000 + 2,000,000 × 98% × 35% = 2,218,400
    expect(q(12000000, 1)).toMatchObject({ ok: true, incomeTax: 2218400, how: 'high_band' });
    // 1,400만원(둘째 구간 시작 전 끝): 1,507,400 + 25,000 + 4,000,000 × 0.98 × 0.35 = 2,904,400 / 둘째 구간의 시작값 1,507,400 + 1,397,000 = 2,904,400 — 경계에서 이어진다
    expect(q(14000000, 1)).toMatchObject({ ok: true, incomeTax: 2904400 });
    expect(q(14000001, 1)).toMatchObject({ ok: true, incomeTax: 2904400 }); // +1원 × 0.98 × 0.38 = 0.37원 → 10원 미만 버림
    // 5,000만원 · 가족 4: 1,170,840 + 13,394,600 + 5,000,000 × 42% = 16,665,440
    expect(q(50000000, 4)).toMatchObject({ ok: true, incomeTax: 16665440 });
    // 1억원 · 가족 1: 1,507,400 + 31,034,600 + 13,000,000 × 45% = 38,392,000
    expect(q(100000000, 1)).toMatchObject({ ok: true, incomeTax: 38392000 });
    // 가족 13명 · 500만원: (11명 세액) − (10명 − 11명) × 2
    const t = band(5000000)!;
    expect(q(5000000, 13)).toMatchObject({ ok: true, baseTax: Math.max(0, t[10] - (t[9] - t[10]) * 2) });
    expect(q(500000, 1)).toMatchObject({ ok: true, incomeTax: 0, how: 'below_table' });
  });

  it('원문 글에서 보이는 글자만 읽는다 (스크립트 · 주석 제외, 그림의 대체 글 포함)', () => {
    expect(pageText('<p>가<script>var x="나"</script><!-- 다 --><img alt="라" src="a.png">&amp;마</p>')).toBe('가 라 &마');
  });
});
