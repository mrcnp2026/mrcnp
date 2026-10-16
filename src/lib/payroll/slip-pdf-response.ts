// 명세서 PDF 응답 — 직원용(내 명세서)과 관리자용(대장의 한 사람)이 같은 틀을 쓴다. 문구는 번역 파일(payslip)에서 읽는다.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/config/brand';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { buildSlipPdf } from './slip-pdf';

export type SlipPdfInput = {
  locale: string; no: string; name: string; employeeNo: string | null; groupId: string | null; month: string; periodFrom: string; periodTo: string; payDate: string; revision: number;
  pay: number; deduction: number; net: number; draft: boolean; practice: boolean; correctionReason: string | null; requestId: string;
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
  const [t, groups] = await Promise.all([getTranslations({ locale: a.locale, namespace: 'payslip' }), loadOrgGroups()]);
  const nf = new Intl.NumberFormat(a.locale, { maximumFractionDigits: 4 });
  const num = (v: string | null) => (v === null ? '' : nf.format(Number(v)));
  const how = (l: SlipPdfInput['lines'][number]) => {
    if (l.quantity === null) return null;
    if (l.unitPrice !== null) return l.factor !== null ? t('howHours', { h: num(l.quantity), rate: num(l.unitPrice), factor: l.factor }) : t('howHoursPlain', { h: num(l.quantity), rate: num(l.unitPrice) });
    return l.factor !== null ? t('howRate', { base: num(l.quantity), rate: l.factor }) : null;
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
          [t('workOvertime'), h(tm.overtimeMinutes)],
          [t('workNight'), h(tm.nightMinutes)],
          [t('workHoliday'), h(tm.holidayMinutes)],
          ...(tm.paidLeaveMinutes ? [[t('workPaidLeave'), h(tm.paidLeaveMinutes)] as [string, string]] : []),
          ...(tm.weeklyRestMinutes ? [[t('workWeeklyRest'), h(tm.weeklyRestMinutes)] as [string, string]] : []),
          ...(tm.paidHolidayMinutes ? [[t('workPaidHoliday'), h(tm.paidHolidayMinutes)] as [string, string]] : []),
        ] as [string, string][],
      }
    : null;
  const bytes = await buildSlipPdf({
    work,
    company: BRAND.name, no: a.no, name: a.name, employeeNo: a.employeeNo ?? '', group: groupPath(groups, a.groupId) ?? '', periodFrom: a.periodFrom, periodTo: a.periodTo, payDate: a.payDate, revision: a.revision, pay: a.pay, deduction: a.deduction, net: a.net,
    // 사업주 부담은 직원용 면에 넣지 않는다
    lines: a.lines.flatMap((l) => (l.kind === 'EMPLOYER' ? [] : [{ kind: l.kind, label: t.has(`line.${l.code}`) ? t(`line.${l.code}`) : l.label, how: how(l), amount: l.amount }])),
    labels: {
      title: t('pdfTitle', { month: a.month }), company: t('hCompany'), no: t('hNo'), name: t('hName'), group: t('hGroup'), period: t('hPeriod'), payDate: t('hPayDate'), revision: t('hRevision'),
      pay: t('pay'), deduction: t('deduction'), item: t('pdfItem'), how: t('pdfHow'), amount: t('pdfAmount'), payTotal: t('pdfPayTotal'), deductionTotal: t('pdfDeductionTotal'), net: t('net'), none: t('none'),
      draft: a.draft ? t('pdfDraft') : null, practice: a.practice ? t('practice') : null, correction: a.revision > 1 ? t('correctedNote', { reason: a.correctionReason ?? '' }) : null,
      note: t('pdfNote'), page: (n, all) => t('pdfPage', { n, all }), money: (n) => t('won', { n: nf.format(n) }),
    },
  });
  // 파일 이름: 급여명세_귀속월_사번_revN.pdf — 주민번호 · 계좌는 넣지 않는다
  const file = `${t('pdfFile')}_${a.month.replace('-', '')}_${(a.employeeNo ?? '').replace(/[^\w가-힣-]/g, '')}_rev${a.revision}${a.draft ? `_${t('pdfDraft')}` : ''}.pdf`;
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
