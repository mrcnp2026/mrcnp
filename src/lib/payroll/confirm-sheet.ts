// 노무 · 세무 확인 요청서 (엑셀) — 프로그램에 들어 있는 급여 기준을 노무사 · 세무사가 보고 「적합 / 수정」을 적어 돌려줄 수 있는 양식.
// (2026-10-13 의뢰인: 수집한 내역을 내려받아 노무 · 세무사 컨펌을 받기 편하게.) 금액 · 개인정보는 들어가지 않는다 — 회사 공통 기준뿐이다.
// 값은 프로그램에 저장된 그대로 적는다. 여기서 값을 바꾸거나 계산해 넣지 않는다.
import 'server-only';
import ExcelJS from 'exceljs';
import type { ItemRow, PolicyRow, ReferenceRow, SettingRow } from './data';
import { rateToPct, type HighBand } from './reference';
import type { AllowancePolicy, AnnualLeavePolicy, Ledger, WorkingTime } from './settings';

const FONT = 'Malgun Gothic';
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const ANSWER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };
const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFB0B8C4' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const ANSWER = ['확인 결과\n(적합 / 수정)', '수정할 값', '의견 · 근거'];
/** 글자가 = + - @ 로 시작하면 수식으로 읽히지 않게 */
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);

type Col = { h: string; w: number };
function sheet(wb: ExcelJS.Workbook, name: string, title: string, note: string, cols: Col[], rows: (string | number | null)[][]) {
  const all = [...cols, ...ANSWER.map((h, i) => ({ h, w: i === 2 ? 36 : 16 }))];
  const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  ws.columns = all.map((c) => ({ width: c.w }));
  ws.mergeCells(1, 1, 1, all.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { name: FONT, size: 14, bold: true };
  ws.mergeCells(2, 1, 2, all.length);
  ws.getCell(2, 1).value = note;
  ws.getCell(2, 1).font = { name: FONT, size: 9, color: { argb: 'FF5B6573' } };
  ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(2).height = 30;
  const head = ws.getRow(4);
  all.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.h;
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = i >= cols.length ? ANSWER_FILL : HEAD_FILL;
    cell.border = box;
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });
  head.height = 32;
  rows.forEach((r, n) => {
    const row = ws.getRow(5 + n);
    all.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.value = i < cols.length ? safe(r[i] ?? null) : null;
      cell.font = { name: FONT, size: 10 };
      cell.border = box;
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (i >= cols.length) cell.fill = ANSWER_FILL;
    });
  });
  if (!rows.length) {
    ws.mergeCells(5, 1, 5, all.length);
    ws.getCell(5, 1).value = '(들어 있는 내용이 없습니다)';
    ws.getCell(5, 1).font = { name: FONT, size: 10, color: { argb: 'FF8A94A3' } };
  }
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.pageSetup.printTitlesRow = '4:4';
  return ws;
}

const won = (n: unknown) => (typeof n === 'number' ? `${n.toLocaleString('ko-KR')}원` : '');
const span = (a: string | null, b: string | null) => (a ? `${a} ~ ${b ? new Date(Date.parse(`${b}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) : '계속'}` : '시행일 확인 필요');
const STATE: Record<string, string> = { PENDING_ADMIN_REVIEW: '검토 대기(아직 쓰이지 않음)', APPROVED: '반영됨(지금 쓰는 값)' };
const VER = (v: string) => (v === 'VERIFIED' ? '검증됨' : '임시');
const PCT = new Set(['employeeRate', 'employerRate', 'totalRate', 'incomeRate', 'healthRate', 'rate', 'stabilityUnder150', 'stabilityPriority150', 'stability150to1000', 'stabilityOver1000']);
const KRW = new Set(['lower', 'upper', 'hourly', 'monthly209', 'monthlyLimit', 'child1', 'child2', 'perExtraChild', 'premiumUpper', 'premiumUpperEmployee', 'premiumLower', 'incomePremiumUpper', 'wageMin', 'wageMaxExclusive']);

const ORDER = ['noticeNo', 'employeeRate', 'employerRate', 'totalRate', 'incomeRate', 'healthRate', 'stabilityUnder150', 'stabilityPriority150', 'stability150to1000', 'stabilityOver1000', 'perThousand', 'rate', 'lower', 'upper', 'premiumUpper', 'premiumUpperEmployee', 'premiumLower', 'incomePremiumUpper', 'hourly', 'monthly209', 'monthlyLimit', 'child1', 'child2', 'perExtraChild'];
const SKIP = new Set(['documentYear', 'datasetDate', 'bandCount', 'wageMin', 'wageMaxExclusive', 'revisedOn']);

export type ConfirmInput = {
  company: string;
  by: string;
  today: string;
  references: ReferenceRow[]; // 검토 대기 + 반영됨
  kindName: (kind: string) => string;
  fieldName: (key: string) => string | null; // 번역이 없는 칸(내부용)은 null — 적지 않는다
  warnName: (w: string) => string;
  allowances: { name: string; legal: string; policy: PolicyRow | null }[];
  annual: PolicyRow | null;
  items: ItemRow[];
  calcName: (k: string) => string;
  taxName: (k: string) => string;
  ordinaryName: (k: string) => string;
  ledger: SettingRow | null;
  workingTime: SettingRow | null;
  ledgerText: (l: Ledger) => [string, string][];
};

export function buildConfirmWorkbook(d: ConfirmInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = d.by;
  wb.created = new Date();

  // ── 0. 표지 ──
  const cover = wb.addWorksheet('확인 요청', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  cover.columns = [{ width: 22 }, { width: 70 }];
  const line = (r: number, a: string, b: string, bold = false) => {
    cover.getCell(r, 1).value = a;
    cover.getCell(r, 2).value = b;
    cover.getCell(r, 1).font = { name: FONT, size: 10, bold: true };
    cover.getCell(r, 2).font = { name: FONT, size: 10, bold };
    cover.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
    cover.getCell(r, 1).alignment = { vertical: 'top' };
  };
  cover.mergeCells('A1:B1');
  cover.getCell('A1').value = '급여 기준 노무 · 세무 확인 요청서';
  cover.getCell('A1').font = { name: FONT, size: 16, bold: true };
  line(3, '회사', d.company);
  line(4, '작성일', d.today);
  line(5, '작성(내려받은 사람)', d.by);
  line(7, '요청 내용', '근태관리 프로그램의 급여 계산에 쓰려고 넣어 둔 기준입니다. 각 장의 노란 칸(확인 결과 · 수정할 값 · 의견)을 채워 돌려주시면 프로그램에 「검증됨」으로 표시하거나 값을 고칩니다.');
  line(8, '보는 방법', '① 공식자료: 공식기관 원문에서 읽은 요율 · 상하한 · 세액 규칙과 그 출처\n② 세액표 규칙: 간이세액표의 고액 구간 식 · 가족 11명 초과 · 자녀 공제\n③ 수당 · 연차 기준: 법정 기준과 회사가 임시로 넣은 기준\n④ 지급 · 공제 항목: 과세 구분 · 통상임금 포함 여부\n⑤ 회사 설정: 급여 지급일 · 공제 기준 · 근로시간');
  line(9, '상태의 뜻', '「검토 대기」: 수집했지만 아직 급여에 쓰이지 않는 값 / 「반영됨」: 급여 담당자가 확인해 지금 쓰는 값\n「임시」: 노무 · 세무 검증 전 / 「검증됨」: 검증을 받았다고 표시한 값');
  line(10, '유의', '이 문서에는 직원 개인정보와 급여 금액이 없습니다. 값은 프로그램에 저장된 그대로이며, 원문에 시행일이 없어 「시행일 확인 필요」로 적힌 줄은 시행일도 함께 확인해 주십시오.');
  [7, 8, 9, 10].forEach((r) => (cover.getRow(r).height = r === 8 ? 90 : 48));
  line(13, '확인자 (노무)', '성명:                              소속 · 자격:                              확인일:                    (서명)');
  line(15, '확인자 (세무)', '성명:                              소속 · 자격:                              확인일:                    (서명)');
  [13, 15].forEach((r) => {
    cover.getCell(r, 1).border = box;
    cover.getCell(r, 2).border = box;
    cover.getRow(r).height = 34;
  });

  // ── 1. 공식자료 ──
  const refRows: (string | number | null)[][] = [];
  const tax: ReferenceRow[] = [];
  for (const r of d.references) {
    if (r.kind === 'income-tax.table') tax.push(r);
    // 읽는 순서: 근로자 → 사업주 → 합계 → 상하한 … (저장된 값의 키 순서는 가나다가 아니라 뒤섞여 있다). 원문 연도 · 배포일 같은 참고 칸은 뺀다
    const fields = Object.entries(r.payload)
      .filter(([k, v]) => !SKIP.has(k) && d.fieldName(k) && (typeof v === 'string' || typeof v === 'number'))
      .sort(([x], [y]) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
    fields.forEach(([k, v], i) => {
      const value = PCT.has(k) ? `${rateToPct(v as string)}%` : KRW.has(k) ? won(Number(v)) : String(v);
      refRows.push([i === 0 ? d.kindName(r.kind) : '', d.fieldName(k), value, i === 0 ? span(r.validFrom, r.validTo) : '', i === 0 ? (r.source?.authority ?? '') : '', i === 0 ? (r.source?.url ?? '') : '', i === 0 ? (STATE[r.state] ?? r.state) : '', i === 0 ? VER(r.verification) : '', i === 0 ? r.warnings.map(d.warnName).join('\n') : '']);
    });
  }
  sheet(wb, '① 공식자료', '① 공식자료 — 사회보험 요율 · 상하한 · 최저임금 · 세액 규칙', '공식기관 원문에서 읽은 값입니다. 요율은 퍼센트로 적었습니다. 「유의」 칸에 적힌 내용(시행일 없음 · 상담 답변에서 읽음 등)을 함께 봐 주십시오.', [{ h: '자료', w: 20 }, { h: '항목', w: 22 }, { h: '값', w: 18 }, { h: '적용기간', w: 24 }, { h: '출처(기관)', w: 16 }, { h: '출처 주소', w: 34 }, { h: '상태', w: 16 }, { h: '검증', w: 8 }, { h: '유의', w: 36 }], refRows);

  // ── 2. 세액표 규칙 ──
  const ruleRows: (string | number | null)[][] = [];
  for (const t of tax) {
    const p = t.payload;
    const head = `${STATE[t.state] ?? t.state} · ${span(t.validFrom, t.validTo)}`;
    ruleRows.push(['표 본체', `급여구간 ${p.bandCount}개 (${won(p.wageMin)} 이상 ~ ${won(p.wageMaxExclusive)} 미만) × 공제대상가족 1~11명`, `별표 2 개정일 ${p.revisedOn ?? '확인 필요'} · 배포일 ${p.datasetDate ?? ''}`, head]);
    if (Array.isArray(p.topRow)) ruleRows.push(['1,000만원인 경우의 세액', (p.topRow as number[]).map((x, i) => `${i + 1}명 ${x.toLocaleString('ko-KR')}`).join(' / '), '원문 「10,000천원」 줄', head]);
    for (const b of (Array.isArray(p.highBands) ? p.highBands : []) as unknown as HighBand[]) {
      ruleRows.push([`${(b.over / 1000).toLocaleString('ko-KR')}천원 초과${b.upTo ? ` ${(b.upTo / 1000).toLocaleString('ko-KR')}천원 이하` : ''}`, `(1,000만원인 경우의 세액)${b.fixed ? ` + ${b.fixed.toLocaleString('ko-KR')}원` : ''} + (${(b.over / 1000).toLocaleString('ko-KR')}천원을 넘는 금액${b.pct98 ? ' × 98%' : ''} × ${b.ratePct}%)`, '원문의 구간별 식', head]);
    }
    ruleRows.push(['가족 11명 초과', p.family11Rule === true ? '(11명인 경우의 세액) − (10명 세액 − 11명 세액) × 11명을 넘는 가족 수' : '규칙을 읽지 못함 — 11명 초과는 조회되지 않음', '별표 2 제4호', head]);
    ruleRows.push(['계산 순서(프로그램)', '표 세액 − 자녀 공제(음수면 0) → 선택 비율(80 · 100 · 120%) → 10원 미만 버림. 지방소득세 = 소득세의 10%(10원 미만 버림). 표의 첫 구간보다 적은 급여는 0원', '프로그램의 임시 순서 — 절사 단계를 확인해 주십시오', head]);
  }
  for (const r of d.references.filter((x) => x.kind === 'income-tax.child-adjust')) {
    const p = r.payload;
    ruleRows.push(['8세 이상 20세 이하 자녀 공제', `1명 ${won(p.child1)} / 2명 ${won(p.child2)} / 3명 이상: 2명 금액 + 2명 초과 1명당 ${won(p.perExtraChild)}`, r.source?.authority ?? '', `${STATE[r.state] ?? r.state} · ${span(r.validFrom, r.validTo)}`]);
  }
  sheet(wb, '② 세액표 규칙', '② 근로소득 간이세액표의 규칙 (소득세법 시행령 별표 2)', '표 본체(급여구간 × 가족 수의 세액)는 양이 많아 여기에 싣지 않았습니다. 프로그램의 「근로소득 간이세액표」 화면에서 볼 수 있습니다.', [{ h: '구분', w: 26 }, { h: '내용', w: 70 }, { h: '근거', w: 30 }, { h: '상태 · 적용기간', w: 34 }], ruleRows);

  // ── 3. 수당 · 연차 ──
  const polRows: (string | number | null)[][] = d.allowances.map((a) => {
    const v = (a.policy?.payload ?? null) as AllowancePolicy | null;
    const company = !a.policy ? '(넣지 않음)' : v?.premium ? `${rateToPct(v.premium)}%${v.premiumOver8h ? ` · 8시간 초과분 ${rateToPct(v.premiumOver8h)}%` : ''}${v.note ? ` · ${v.note}` : ''}` : '가산율 없음';
    return [a.name, a.legal, company, a.policy ? (a.policy.inUse ? '사용' : '사용 안 함') : '', a.policy?.validFrom ?? '', a.policy ? VER(a.policy.verification) : ''];
  });
  const an = d.annual?.payload as AnnualLeavePolicy | undefined;
  if (an) polRows.push(['연차 산정 방식', '근로기준법 제60조', `${an.basis === 'hire_date' ? '입사일 기준' : '회계연도 기준'} · 1년 미만: 한 달 개근마다 ${an.firstYearMonthly}일(최대 ${an.firstYearMax}일) · 1년 이상: ${an.baseDays}일(출근율 ${rateToPct(an.minAttendance)}% 이상) · ${an.extraFromYear}년 차부터 ${an.extraEveryYears}년마다 1일 추가(최대 ${an.maxDays}일)`, '아직 실제 연차 발생에 쓰이지 않음', d.annual!.validFrom, VER(d.annual!.verification)]);
  sheet(wb, '③ 수당 · 연차 기준', '③ 법정수당의 회사 기준과 연차 산정 방식', '「회사 기준」은 통상 쓰는 방식을 임시로 넣은 값입니다. 가산율은 기본임금 100%에 더 얹는 비율입니다(휴업수당은 평균임금에 곱하는 비율).', [{ h: '항목', w: 20 }, { h: '법정 기준(프로그램의 안내 문구)', w: 46 }, { h: '회사 기준(프로그램 값)', w: 46 }, { h: '사용 여부', w: 14 }, { h: '적용 시작', w: 12 }, { h: '검증', w: 8 }], polRows);

  // ── 4. 지급 · 공제 항목 ──
  sheet(
    wb,
    '④ 지급 · 공제 항목',
    '④ 지급 항목과 공제 항목',
    '금액은 직원 계약에서 정하므로 여기에는 없습니다. 통상임금 「포함」 항목이 수당 단가(통상시급)의 바탕이 됩니다.',
    [{ h: '구분', w: 8 }, { h: '코드', w: 22 }, { h: '항목명', w: 18 }, { h: '계산 방식', w: 16 }, { h: '고정수당', w: 10 }, { h: '과세 구분', w: 14 }, { h: '비과세 한도', w: 14 }, { h: '통상임금', w: 10 }, { h: '사용', w: 8 }, { h: '검증', w: 8 }],
    d.items.map((i) => [i.kind === 'PAYMENT' ? '지급' : '공제', i.code, i.koName, d.calcName(i.calcKind), i.fixedAllowance ? '고정수당' : '', i.kind === 'PAYMENT' ? d.taxName(i.taxTreatment) : '', i.taxExemptLimit === null ? '' : won(i.taxExemptLimit), i.kind === 'PAYMENT' ? d.ordinaryName(i.ordinaryWage) : '', i.inUse ? '사용' : '사용 안 함', VER(i.verification)]),
  );

  // ── 5. 회사 설정 ──
  const setRows: (string | number | null)[][] = [];
  if (d.ledger) for (const [a, b] of d.ledgerText(d.ledger.payload as Ledger)) setRows.push(['급여대장', a, b, d.ledger.validFrom, VER(d.ledger.verification)]);
  const w = d.workingTime?.payload as WorkingTime | undefined;
  if (w) {
    setRows.push(['근로시간', '1주 소정 근로시간', `${w.weeklyHours}시간`, d.workingTime!.validFrom, VER(d.workingTime!.verification)]);
    setRows.push(['근로시간', '1주 연장 근로시간 한도', `${w.weeklyOvertimeLimit}시간`, d.workingTime!.validFrom, VER(d.workingTime!.verification)]);
    setRows.push(['근로시간', '월 환산시간(수당 단가의 분모)', w.monthlyHours === null ? '(정하지 않음)' : `${w.monthlyHours}시간`, d.workingTime!.validFrom, VER(d.workingTime!.verification)]);
  }
  sheet(wb, '⑤ 회사 설정', '⑤ 회사 급여 설정', '회사가 고르는 값입니다. 법정 단일 정답은 없지만 선택이 적절한지 의견을 주십시오.', [{ h: '화면', w: 14 }, { h: '항목', w: 30 }, { h: '값', w: 44 }, { h: '적용 시작', w: 12 }, { h: '검증', w: 8 }], setRows);
  return wb;
}
