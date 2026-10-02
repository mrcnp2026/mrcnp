// 월별 근태 증빙 엑셀 (②-4 7-5 · 11-A 엑셀 항목)
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildAttendanceWorkbook, hasFormula, hm, type AttendanceReport } from '@/lib/export-xlsx';
import { SAMPLE } from './fixtures/report-sample';


async function roundTrip(r: AttendanceReport) {
  const buf = await buildAttendanceWorkbook(r).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}
const findCell = (ws: ExcelJS.Worksheet, v: unknown) => {
  let hit: ExcelJS.Cell | null = null;
  ws.eachRow((row) => row.eachCell((c) => {
    if (!hit && c.value === v) hit = c;
  }));
  return hit as ExcelJS.Cell | null;
};

describe('월별 근태 증빙 엑셀', () => {
  it('시트 4개: 월간근태확인서 · 원본데이터 · 정정이력 · 적용기준', async () => {
    const wb = await roundTrip(SAMPLE);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['월간근태확인서', '원본데이터', '정정이력', '적용기준']);
  });
  it('시트1에 수식이 하나도 없다 — 합계도 값 (4-8, B-7)', async () => {
    const ws = (await roundTrip(SAMPLE)).getWorksheet('월간근태확인서')!;
    expect(hasFormula(ws)).toBe(false);
    expect(findCell(ws, '합계')).not.toBeNull();
    expect(findCell(ws, hm(10140 + 9120))).not.toBeNull(); // 총 근로 합계 = 322:00
  });
  it("사번 '001'이 글자로 남는다 (앞의 0이 안 사라짐)", async () => {
    const wb = await roundTrip(SAMPLE);
    for (const name of ['월간근태확인서', '원본데이터']) {
      const c = findCell(wb.getWorksheet(name)!, '001');
      expect(c, name).not.toBeNull();
      expect(c!.numFmt).toBe('@');
    }
  });
  it('시트1은 A4 세로 한 장 인쇄 + 인쇄 영역 + 서명란', async () => {
    const ws = (await roundTrip(SAMPLE)).getWorksheet('월간근태확인서')!;
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.fitToPage).toBe(true);
    expect([ws.pageSetup.fitToWidth, ws.pageSetup.fitToHeight]).toEqual([1, 1]);
    expect(ws.pageSetup.printArea).toMatch(/^A1:L\d+$/);
    for (const v of ['작 성', '확 인', '승 인']) expect(findCell(ws, v)).not.toBeNull();
  });
  it('원본데이터: 근무일은 날짜 값, 시각은 글자 (다른 열)', async () => {
    const ws = (await roundTrip(SAMPLE)).getWorksheet('원본데이터')!;
    expect(ws.getCell('C2').value).toBeInstanceOf(Date);
    expect(ws.getCell('E2').value).toBe('08:52');
  });
  it('적용기준에 생성 일시와 생성자', async () => {
    const ws = (await roundTrip(SAMPLE)).getWorksheet('적용기준')!;
    expect(String(ws.getCell('A1').value)).toBe('이 파일은 2026-11-02 09:15에 관리자이(가) 생성했습니다.');
  });
  it('연습 기록이면 시트1 위에 경고', async () => {
    const ws = (await roundTrip({ ...SAMPLE, practice: true })).getWorksheet('월간근태확인서')!;
    let warned = false;
    ws.eachRow((row) => row.eachCell((c) => {
      if (String(c.value).includes('연습 기록입니다')) warned = true;
    }));
    expect(warned).toBe(true);
  });
});
