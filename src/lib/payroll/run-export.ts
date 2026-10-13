// 급여대장 엑셀 (PRD v1.3 23.4) — 대장요약 · 지급공제항목 · 근태근거 · 검산·기준 · 메타 다섯 시트.
// ★ 값은 저장된 명세서 그대로 적는다. 엑셀 수식을 넣지 않는다(서버와 다른 값이 나오지 않게). 숫자는 숫자 칸으로.
// ★ 주민번호 · 계좌는 없다(저장하지 않는다). 이체용 파일이 아니다.
// ★ 초안 · 계산됨 · 검토됨 대장은 시트마다 「검토용」이라고 적힌다.
import 'server-only';
import ExcelJS from 'exceljs';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RunRow } from './run-data';

const FONT = 'Malgun Gothic';
const HEAD: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFB0B8C4' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const safe = (v: string | number | null) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v); // 글자가 수식으로 읽히지 않게
type Cell = string | number | null;
type Col = { h: string; w: number; money?: boolean };
type Row = Record<string, unknown>;

function sheet(wb: ExcelJS.Workbook, name: string, banner: string, cols: Col[], rows: Cell[][]) {
  const ws = wb.addWorksheet(name, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = cols.map((c) => ({ width: c.w }));
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = banner;
  ws.getCell(1, 1).font = { name: FONT, size: 10, bold: true };
  cols.forEach((c, i) => {
    const cell = ws.getRow(2).getCell(i + 1);
    cell.value = c.h;
    cell.font = { name: FONT, size: 10, bold: true };
    cell.fill = HEAD;
    cell.border = box;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  rows.forEach((r, ri) => {
    r.forEach((v, i) => {
      const cell = ws.getRow(ri + 3).getCell(i + 1);
      cell.value = safe(v);
      cell.font = { name: FONT, size: 10 };
      cell.border = box;
      if (typeof v === 'number') cell.numFmt = cols[i].money ? '#,##0;[Red]-#,##0' : '#,##0.####';
    });
  });
  return ws;
}

export type RunExportLabels = { status: string; kind: string; mode: string; line: (code: string, fallback: string) => string; pay: string; deduction: string; employer: string; auto: string; manual: string; override: string; blocked: string; ok: string; draftBanner: string; finalBanner: string };

export async function buildRunWorkbook(args: { run: RunRow; company: string; by: string; now: string; labels: RunExportLabels }): Promise<{ wb: ExcelJS.Workbook; statements: number }> {
  const { run, labels: L } = args;
  const c = createAdminClient();
  const month = run.periodFrom.slice(0, 7);
  const banner = `${args.company} · ${month} ${L.kind}${run.revision > 1 ? ` rev${run.revision}` : ''} · ${run.status === 'FINALIZED' ? L.finalBanner : L.draftBanner}`;
  const wb = new ExcelJS.Workbook();
  wb.creator = args.company;
  const [{ data: sts }, { data: people }, { data: groups }, { data: gen }] = await Promise.all([
    run.generationId ? c.from('payroll_statements').select('*').eq('generation_id', run.generationId) : Promise.resolve({ data: [] as Row[] }),
    c.from('profiles').select('id, name, employee_no, group_id'),
    c.from('org_groups').select('id, name, parent_id'),
    run.generationId ? c.from('payroll_calculation_generations').select('seq, input_hash, engine_version, result_hash, created_at').eq('id', run.generationId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const list = ((sts ?? []) as Row[]).map((s) => ({ s, p: (people ?? []).find((x) => x.id === s.employee_id) })).sort((a, b) => String(a.p?.name ?? '').localeCompare(String(b.p?.name ?? '')));
  const groupName = (id: unknown) => {
    const g = (groups ?? []).find((x) => x.id === id);
    const parent = g?.parent_id ? (groups ?? []).find((x) => x.id === g.parent_id) : null;
    return g ? (parent ? `${parent.name} › ${g.name}` : (g.name as string)) : '';
  };
  const no = (s: Row) => `${month.replace('-', '')}-${run.kind[0]}${run.sequence}-${String((s.id as string).slice(0, 8)).toUpperCase()}`; // 사람이 읽는 표시 번호 (내부 번호와 따로)
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const ids = list.map((x) => x.s.id as string);
  const items: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await c.from('payroll_statement_items').select('*').in('statement_id', ids.slice(i, i + 200)).order('created_at').order('line_no');
    items.push(...((data ?? []) as Row[]));
  }

  sheet(wb, '대장요약', banner, [{ h: '명세번호', w: 24 }, { h: '판', w: 6 }, { h: '사번', w: 14 }, { h: '이름', w: 14 }, { h: '소속', w: 20 }, { h: '귀속 시작', w: 12 }, { h: '귀속 끝', w: 12 }, { h: '지급일', w: 12 }, { h: '유형', w: 8 }, { h: '상태', w: 10 }, { h: '계산', w: 8 }, { h: '지급 합계', w: 14, money: true }, { h: '공제 합계', w: 14, money: true }, { h: '실지급', w: 14, money: true }, { h: '사업주 부담', w: 14, money: true }],
    list.map(({ s, p }) => [no(s), run.revision, (p?.employee_no as string) ?? '', (p?.name as string) ?? '', groupName(p?.group_id), run.periodFrom, new Date(Date.parse(`${run.periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), run.payDate, L.kind, L.status, s.state === 'OK' ? L.ok : L.blocked, n(s.pay_total), n(s.deduction_total), n(s.net_total), n(s.employer_total)]));
  const stOf = new Map(list.map((x) => [x.s.id as string, x]));
  sheet(wb, '지급공제항목', banner, [{ h: '명세번호', w: 24 }, { h: '사번', w: 14 }, { h: '이름', w: 14 }, { h: '항목코드', w: 16 }, { h: '항목명', w: 22 }, { h: '구분', w: 12 }, { h: '수량', w: 12 }, { h: '단가', w: 14 }, { h: '계수', w: 10 }, { h: '끝수 처리 전', w: 16 }, { h: '금액', w: 14, money: true }, { h: '자동/수동', w: 10 }, { h: '근거', w: 50 }],
    items.map((i) => {
      const x = stOf.get(i.statement_id as string)!;
      const kind = i.kind === 'PAYMENT' ? L.pay : i.kind === 'DEDUCTION' ? L.deduction : L.employer;
      return [no(x.s), (x.p?.employee_no as string) ?? '', (x.p?.name as string) ?? '', i.item_code as string, L.line(String(i.item_code).replace(/_EMPLOYER$/, ''), i.label_ko as string), kind, n(i.quantity), n(i.unit_price), n(i.factor), n(i.raw_value), n(i.amount), i.source === 'AUTO' ? L.auto : i.source === 'MANUAL' ? L.manual : L.override, JSON.stringify(i.calc_trace ?? {})];
    }));
  sheet(wb, '근태근거', banner, [{ h: '사번', w: 14 }, { h: '이름', w: 14 }, { h: '소정(분)', w: 12 }, { h: '실제(분)', w: 12 }, { h: '급여용(분)', w: 12 }, { h: '인정 연장(분)', w: 14 }, { h: '인정 야간(분)', w: 14 }, { h: '인정 휴일(분)', w: 14 }, { h: '유급휴가(일)', w: 12 }, { h: '근태 마감', w: 38 }],
    list.map(({ s, p }) => {
      const a = ((s.snapshot as Row | null)?.attendance ?? null) as { regularMinutes: number; netMinutes: number; payableMinutes: number; approved: { overtime: number; night: number; holidayWithin8: number; holidayOver8: number }; paidLeaveDays: number } | null;
      return [(p?.employee_no as string) ?? '', (p?.name as string) ?? '', a?.regularMinutes ?? null, a?.netMinutes ?? null, a?.payableMinutes ?? null, a?.approved.overtime ?? null, a?.approved.night ?? null, a ? a.approved.holidayWithin8 + a.approved.holidayOver8 : null, a?.paidLeaveDays ?? null, (s.close_id as string | null) ?? ''];
    }));
  const sum = (k: string) => list.reduce((acc, x) => acc + (Number(x.s[k] ?? 0) || 0), 0);
  const itemSum = (kind: string) => items.filter((i) => i.kind === kind).reduce((acc, i) => acc + Number(i.amount), 0);
  const bundle = (list[0]?.s.reference_bundle ?? {}) as Record<string, { id: string; hash: string }>;
  sheet(wb, '검산·기준', banner, [{ h: '항목', w: 34 }, { h: '값', w: 70 }], [
    ['계산 세대', gen ? `#${gen.seq} · ${gen.created_at}` : ''],
    ['엔진 버전', (gen?.engine_version as string) ?? ''],
    ['입력 해시', (gen?.input_hash as string) ?? ''],
    ['결과 해시', (gen?.result_hash as string) ?? ''],
    ['요약의 지급 합계', sum('pay_total')],
    ['항목 시트의 지급 합계', itemSum('PAYMENT')],
    ['요약의 공제 합계', sum('deduction_total')],
    ['항목 시트의 공제 합계', itemSum('DEDUCTION')],
    ['요약의 실지급 합계', sum('net_total')],
    ['지급 − 공제', itemSum('PAYMENT') - itemSum('DEDUCTION')],
    ['합계 검증', sum('pay_total') === itemSum('PAYMENT') && sum('deduction_total') === itemSum('DEDUCTION') && sum('net_total') === itemSum('PAYMENT') - itemSum('DEDUCTION') ? '일치' : '불일치'],
    ...Object.entries(bundle).map(([k, v]): Cell[] => [`기준 자료 · ${k}`, `${v.id} (${v.hash.slice(0, 12)})`]),
  ]);
  sheet(wb, '메타', banner, [{ h: '항목', w: 24 }, { h: '값', w: 60 }], [
    ['생성 일시', args.now], ['모드', L.mode], ['상태', L.status], ['유형', L.kind], ['귀속 달', month], ['판', run.revision], ['차수', run.sequence], ['명세서 수', list.length], ['내보낸 담당자', args.by], ['명세 schemaVersion', 'run-export-1'],
    ['안내', '이체용 파일이 아닙니다. 주민번호 · 계좌는 들어 있지 않습니다. 값은 프로그램에 저장된 명세서 그대로이며 수식이 없습니다.'],
  ]);
  return { wb, statements: list.length };
}
