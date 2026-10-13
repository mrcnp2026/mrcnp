// 명세서 PDF — 파일이 만들어지는지, 항목이 많으면 다음 쪽으로 넘어가는지, 글꼴이 심기는지
import { writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { buildSlipPdf } = await import('@/lib/payroll/slip-pdf');
type Data = Parameters<typeof buildSlipPdf>[0];

const labels: Data['labels'] = {
  title: '2026-09 급여명세서', company: '회사', no: '명세 번호', name: '이름 (사번)', group: '소속', period: '귀속 기간', payDate: '지급일', revision: '판',
  pay: '지급', deduction: '공제', item: '항목', how: '계산 방법', amount: '금액', payTotal: '지급 합계', deductionTotal: '공제 합계', net: '실지급액', none: '항목이 없습니다.',
  draft: null, practice: null, correction: null, note: '이 명세서는 프로그램에 저장된 값 그대로입니다.', page: (n, all) => `${n} / ${all}`, money: (n) => `${n.toLocaleString('ko-KR')}원`,
};
const base: Data = {
  company: '(주)검사회사', no: '202609-R1-ABCDEF12', name: '홍길동', employeeNo: 'A-001', group: '본사 › 경영지원', periodFrom: '2026-09-01', periodTo: '2026-09-30', payDate: '2026-10-10', revision: 1, pay: 3_200_000, deduction: 412_340, net: 2_787_660, labels,
  lines: [
    { kind: 'PAYMENT', label: '기본급', how: null, amount: 3_000_000 },
    { kind: 'PAYMENT', label: '연장근로수당', how: '10시간 × 14,354원 × 1.5', amount: 200_000 },
    { kind: 'DEDUCTION', label: '국민연금', how: '3,200,000원 × 0.045', amount: 144_000 },
    { kind: 'DEDUCTION', label: '소득세', how: null, amount: 268_340 },
  ],
};

describe('buildSlipPdf', () => {
  it('A4 한 쪽짜리 PDF를 만든다', async () => {
    const bytes = await buildSlipPdf(base);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(doc.getTitle()).toContain('202609-R1-ABCDEF12');
    expect(bytes.length).toBeLessThan(400_000); // 글꼴은 쓴 글자만 심는다(통째로 넣지 않는다)
    if (process.env.SLIP_PDF_OUT) writeFileSync(`${process.env.SLIP_PDF_OUT}-1.pdf`, bytes);
  });
  it('항목이 많으면 다음 쪽으로 넘어가고, 검토용 · 정정 표시가 들어가도 만들어진다', async () => {
    const many = [...Array(70)].map((_, i) => ({ kind: i % 2 ? ('DEDUCTION' as const) : ('PAYMENT' as const), label: `검사 항목 ${i + 1} — 이름이 아주 긴 항목은 줄을 바꿔서 적는다`, how: i % 3 ? `${i}시간 × 10,030원 × 1.5 (계산 설명이 길면 여기도 줄을 바꾼다)` : null, amount: 1000 * (i + 1) }));
    const bytes = await buildSlipPdf({ ...base, revision: 2, lines: many, labels: { ...labels, draft: '검토용', practice: '연습', correction: '정정된 명세서입니다. 정정 사유: 연장근로 시간 누락' } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    if (process.env.SLIP_PDF_OUT) writeFileSync(`${process.env.SLIP_PDF_OUT}-2.pdf`, bytes);
  });
  it('항목이 하나도 없어도 만들어진다', async () => {
    const doc = await PDFDocument.load(await buildSlipPdf({ ...base, lines: [], pay: 0, deduction: 0, net: 0 }));
    expect(doc.getPageCount()).toBe(1);
  });
});
