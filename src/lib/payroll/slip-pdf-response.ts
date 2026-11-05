// 명세서 PDF 응답 — 직원용(내 명세서)과 관리자용(대장의 한 사람)이 같은 틀을 쓴다. 문구는 번역 파일(payslip)에서 읽는다.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { companyName } from '@/lib/company'; // 통합설정 › 회사 기본설정의 회사명 (2026-10-18)
import { groupPath } from '@/lib/org';
import { slipCalcShown } from '@/lib/switches';
import { loadOrgGroups } from '@/lib/org-data';
import { payFileName } from './file-name';
import { buildSlipPdf } from './slip-pdf';

export type SlipPdfInput = {
  locale: string; no: string; name: string; employeeNo: string | null; groupId: string | null; month: string; periodFrom: string; periodTo: string; payDate: string; revision: number;
  pay: number; deduction: number; net: number; draft: boolean; practice: boolean; correctionReason: string | null; requestId: string; tax?: { taxable: number; exempt: number } | null;
  familyTemp?: number | null; // 부양가족 신고 전이면 그때 쓴 가족 수 → 「임시」 문구 (slipFamilyTemp)
  lines: { code: string; kind: 'PAYMENT' | 'DEDUCTION' | 'EMPLOYER'; label: string; quantity: string | null; unitPrice: string | null; factor: string | null; amount: number }[];
  time?: SlipTime | null; // 저장된 명세의 시간 입력(snapshot.time). 올린 명세서 · 상여에는 없다
};

/** 명세서의 근로 내역에 쓰는 시간 (급여 엔진의 EngineTime 가운데 보여 줄 것만) */
export type SlipTime = { workDays?: number; workedMinutes: number; overtimeMinutes: number; nightMinutes: number; holidayMinutes: number; paidLeaveMinutes?: number; weeklyRestMinutes?: number; paidHolidayMinutes?: number };
export const asSlipTime = (v: unknown): SlipTime | null => {
  const t = v as Partial<SlipTime> | null | undefined;
  return t && typeof t.workedMinutes === 'number' ? (t as SlipTime) : null;
};

/** 명세서 한 장의 PDF와 파일 이름 — 응답 한 장(slipPdfResponse)과 대장 전체 묶음이 같이 쓴다 */
export async function slipPdfBytes(a: SlipPdfInput): Promise<{ bytes: Uint8Array; file: string; draftLabel: string; fileLabel: string }> {
  const [t, groups, calcOn] = await Promise.all([getTranslations({ locale: a.locale, namespace: 'payslip' }), loadOrgGroups(), slipCalcShown()]);
  const nf = new Intl.NumberFormat(a.locale, { maximumFractionDigits: 4 });
  const num = (v: string | null) => (v === null ? '' : nf.format(Number(v)));
  // 산출방식이 꺼져 있으면(관리자 토글, 2026-10-30) 모든 줄이 null → buildSlipPdf가 계산 방법 칸을 그리지 않는다
  const how = (l: SlipPdfInput['lines'][number]) => {
    if (!calcOn || l.quantity === null) return null;
    if (l.unitPrice !== null) return l.factor !== null ? t('howHours', { h: num(l.quantity), rate: num(l.unitPrice), factor: l.factor }) : t('howHoursPlain', { h: num(l.quantity), rate: num(l.unitPrice) });
    // 요율은 %로 (0.0475 → 4.75%) — 2026-10-30
    const pct = (f: string) => (Number(f) > 0 && Number(f) < 1 ? `${nf.format(Math.round(Number(f) * 1e6) / 1e4)}%` : f);
    return l.factor !== null ? t('howRate', { base: num(l.quantity), rate: pct(l.factor) }) : null;
  };
  const h = (m: number) => t('hours', { h: nf.format(Math.round((m / 60) * 100) / 100) });
  const tm = a.time;
  const work = tm
    ? {
        title: t('workTitle'),
        rows: [
          [t('workDays'), tm.workDays === undefined ? '—' : t('days', { n: tm.workDays })],
          [t('workTotal'), h(tm.workedMinutes)],
          [t('workRegular'), h(Math.max(0, tm.workedMinutes - tm.overtimeMinutes - tm.holidayMinutes))],
          // 0인 시간은 적지 않는다(2026-10-30 의뢰인: 쓸데없는 칸)
          ...(tm.overtimeMinutes ? [[t('workOvertime'), h(tm.overtimeMinutes)] as [string, string]] : []),
          ...(tm.nightMinutes ? [[t('workNight'), h(tm.nightMinutes)] as [string, string]] : []),
          ...(tm.holidayMinutes ? [[t('workHoliday'), h(tm.holidayMinutes)] as [string, string]] : []),
          ...(tm.paidLeaveMinutes ? [[t('workPaidLeave'), h(tm.paidLeaveMinutes)] as [string, string]] : []),
          ...(tm.weeklyRestMinutes ? [[t('workWeeklyRest'), h(tm.weeklyRestMinutes)] as [string, string]] : []),
          ...(tm.paidHolidayMinutes ? [[t('workPaidHoliday'), h(tm.paidHolidayMinutes)] as [string, string]] : []),
        ] as [string, string][],
      }
    : null;
  const bytes = await buildSlipPdf({
    work,
    tax: a.tax ?? null,
    company: await companyName(), no: a.no, name: a.name, employeeNo: a.employeeNo ?? '', group: groupPath(groups, a.groupId) ?? '', periodFrom: a.periodFrom, periodTo: a.periodTo, payDate: a.payDate, revision: a.revision, pay: a.pay, deduction: a.deduction, net: a.net,
    // 사업주 부담은 직원용 면에 넣지 않는다
    lines: a.lines.flatMap((l) => (l.kind === 'EMPLOYER' ? [] : [{ kind: l.kind, label: t.has(`line.${l.code}`) ? t(`line.${l.code}`) : l.label, how: how(l), amount: l.amount }])),
    labels: {
      // 칸 이름은 회사가 쓰던 명세서(급여4) 그대로 — form.* (2026-10-30 의뢰인)
      title: t('pdfTitle', { month: a.month }), company: t('form.company'), no: t('form.no'), name: t('form.name'), group: t('form.group'), period: t('form.period'), payDate: t('hPayDate'), revision: t('hRevision'),
      pay: t('form.pay'), deduction: t('form.deduction'), sum: t('form.sum'), item: t('form.item'), how: t('form.how'), amount: t('form.amount'), payTotal: t('form.payTotal'), deductionTotal: t('form.deductionTotal'), net: t('form.net'), none: t('none'), taxable: t('taxableTotal'), exempt: t('exemptTotal'),
      draft: a.draft ? t('pdfDraft') : null, practice: a.practice ? t('practice') : null, correction: null, correctionMark: a.revision > 1 ? t('pdfCorrectionMark', { n: a.revision }) : null, formula: t('form.formula'), thanks: t('form.thanks'), // 정정 사유 문장은 종이에 넣지 않는다(화면에만)
      familyTemp: a.familyTemp != null ? t('familyTemp', { n: a.familyTemp }) : null,
      note: t('pdfNote'), page: (n, all) => t('pdfPage', { n, all }), money: (n) => t('won', { n: nf.format(n) }),
    },
  });
  // 파일 이름: 급여명세_귀속월_사번_revN.pdf — 주민번호 · 계좌는 넣지 않는다
  const file = await payFileName({ ym: a.month, doc: 'slips', who: a.name, revision: a.revision, draft: a.draft, ext: 'pdf' }); // 「2026년 10월 급여명세서 정재호.pdf」 (2026-11-05 의뢰인)
  return { bytes, file, draftLabel: t('pdfDraft'), fileLabel: t('pdfFile') };
}

export async function slipPdfResponse(a: SlipPdfInput): Promise<Response> {
  const { bytes, file } = await slipPdfBytes(a);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="payslip_${a.month.replace('-', '')}_rev${a.revision}.pdf"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      'x-request-id': a.requestId,
    },
  });
}

/** 저장된 계산 결과(snapshot.totals.taxable)로 과세 대상 · 비과세 (2026-10-22). 예전 명세서처럼 값이 없으면 null — 칸을 그리지 않는다 */
export function slipTax(snapshot: unknown, pay: number | null): { taxable: number; exempt: number } | null {
  const t = (snapshot as { totals?: { taxable?: unknown } | null } | null)?.totals;
  if (!t || typeof t.taxable !== 'number' || pay === null) return null;
  return { taxable: t.taxable, exempt: Math.max(0, pay - t.taxable) };
}

