// 메일 명세서 PDF 잠그기 — 생년월일 6자리 비밀번호, 잠긴 파일은 비밀번호 없이 열리지 않는다
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { birthPassword, lockPdf } = await import('@/lib/payroll/slip-lock');
const { buildSlipPdf } = await import('@/lib/payroll/slip-pdf');

describe('birthPassword', () => {
  it('YYYY-MM-DD → YYMMDD', () => {
    expect(birthPassword('1990-01-15')).toBe('900115');
    expect(birthPassword('2001-12-03')).toBe('011203');
  });
  it('없거나 모양이 다르면 null — 보내지 않는다', () => {
    expect(birthPassword(null)).toBeNull();
    expect(birthPassword(undefined)).toBeNull();
    expect(birthPassword('')).toBeNull();
    expect(birthPassword('19900115')).toBeNull();
  });
});

describe('lockPdf', () => {
  it('실제 명세서 PDF(한글 글꼴)를 AES-256으로 잠근다', async () => {
    const page = (n: number, all: number) => `${n} / ${all}`;
    const bytes = await buildSlipPdf({
      company: '(주)검사회사', no: '202609-U1-ABCDEF12', name: '홍길동', employeeNo: 'A-001', group: '본사', periodFrom: '2026-09-01', periodTo: '2026-09-30', payDate: '2026-10-10', revision: 1, pay: 3_000_000, deduction: 300_000, net: 2_700_000,
      lines: [{ kind: 'PAYMENT', label: '기본급', how: null, amount: 3_000_000 }, { kind: 'DEDUCTION', label: '소득세', how: null, amount: 300_000 }],
      labels: { title: '2026-09 급여명세서', company: '회사', no: '번호', name: '이름', group: '소속', period: '기간', payDate: '지급일', revision: '판', pay: '지급', deduction: '공제', item: '항목', how: '방법', amount: '금액', payTotal: '지급 합계', deductionTotal: '공제 합계', net: '실지급액', none: '없음', draft: null, practice: null, correction: null, note: '메모', page, money: (n) => `${n}원` },
    });
    const locked = await lockPdf(bytes, '900115');
    const raw = Buffer.from(locked).toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw).toMatch(/\/Encrypt\s/);
    expect(raw).toMatch(/\/CFM \/AESV3/);
    expect(raw).not.toContain('900115'); // 비밀번호가 파일에 그대로 들어가지 않는다
    await expect(PDFDocument.load(locked)).rejects.toThrow(/encrypted/i); // 잠긴 파일
    if (process.env.SLIP_PDF_OUT) (await import('node:fs')).writeFileSync(`${process.env.SLIP_PDF_OUT}-locked.pdf`, locked);
  });
});
