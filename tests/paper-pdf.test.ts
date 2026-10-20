// 일용 지급명세서 · 퇴직급여 계산서 PDF (2026-10-20) — 저장된 값으로 파일이 만들어지는지, 금액이 맞게 들어가는지
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const ko = JSON.parse(readFileSync('messages/ko.json', 'utf-8')).paperPdf;
// 번역: 키를 따라가 {이름}을 바꾼다 (next-intl 대신)
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, v: Record<string, unknown> = {}) => String(key.split('.').reduce((o: Record<string, unknown>, k) => o[k] as Record<string, unknown>, ko)).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')),
}));
vi.mock('@/lib/company', () => ({ companyName: async () => '(주)검사회사' }));
vi.mock('@/lib/org-data', () => ({ loadOrgGroups: async () => [] }));
const { dailyPdfBytes, retirementPdfBytes } = await import('@/lib/payroll/paper-pdf');
const { calcRetirement } = await import('@/lib/payroll/retirement');

const run = { id: 'r', kind: 'DAILY', title: null, periodFrom: '2026-10-01', periodTo: '2026-11-01', payDate: '2026-11-05', sequence: 1, isTest: false, revision: 1, status: 'FINALIZED', version: 1, generationId: 'g', totals: {}, createdBy: 'x', createdAt: '', reviewedBy: null, reviewedAt: null, finalizedBy: null, finalizedAt: null, supersedesId: null, correctionReason: null } as const;
const line = { payeeId: 'p', name: '홍길동', internalNo: 'D-001', state: 'OK', blockers: [], warnings: [], workDays: 2, gross: 400_000, taxable: 400_000, nontax: 0, incomeTax: 2_700, localTax: 260, otherDeduction: 0, net: 397_040, days: [{ workDate: '2026-10-01', gross: 200_000, incomeTax: 1_350, localTax: 130, deduction: 0 }, { workDate: '2026-10-02', gross: 200_000, incomeTax: 1_350, localTax: 130, deduction: 0 }] } as const;

describe('paper PDF', () => {
  it('일용 지급명세서 — 한 쪽, 파일 이름에 근무월 · 내부번호', async () => {
    const { bytes, file } = await dailyPdfBytes({ ...run }, { ...line, blockers: [], warnings: [], days: [...line.days] });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(file).toBe('일용지급명세_202610_D-001_rev1.pdf');
    if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(`${process.env.PDF_OUT}/daily.pdf`, bytes);
  });
  it('계산이 안 된 줄은 만들지 않는다', async () => {
    await expect(dailyPdfBytes({ ...run }, { ...line, state: 'BLOCKED', gross: null, net: null, blockers: [], warnings: [], days: [] })).rejects.toThrow();
  });
  it('퇴직급여 계산서 — 출국만기보험 · 세액을 빼고 실지급', async () => {
    const input = { periodFrom: '2023-01-02', periodTo: '2026-10-19', excludedDays: 0, wage3m: 9_000_000, days3m: 92, bonus1y: 0, leavePay1y: 0, ordinaryDaily: null, departureInsurance: 3_000_000 };
    const result = calcRetirement(input as never);
    const k = { id: 'abcdef12-0000-0000-0000-000000000000', employeeId: 'e', kind: 'FINAL', periodFrom: input.periodFrom, periodTo: input.periodTo, baseOn: input.periodTo, input, result, sources: null, amount: result.amount, taxAmount: 50_000, taxBasis: '세무사 확인', state: 'DRAFT', revision: 1, supersedesId: null, reason: null, isTest: false, createdBy: 'x', createdAt: '2026-10-20T00:00:00Z', finalizedBy: null, finalizedAt: null } as never;
    const { bytes, file } = await retirementPdfBytes(k, { name: '홍길동', employeeNo: 'A-001', groupId: null });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(file).toBe('퇴직급여계산서_A-001_20261019_rev1.pdf');
    if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(`${process.env.PDF_OUT}/retirement.pdf`, bytes);
  });
});
