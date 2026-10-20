// 급여명세서 말고 다른 종이 두 가지 — 일용 근로 지급명세서 · 퇴직급여 계산서 (2026-10-20, 미구현 #12 · #14).
// 급여명세서 PDF 틀(slip-pdf)을 그대로 쓰고 글자만 바꾼다. 값은 저장된 계산 결과 그대로 적는다(여기서 다시 계산하지 않는다).
// ★ 주민번호 · 계좌는 없다. 확정 전이면 쪽마다 「검토용」, 연습 자료는 「연습」이 찍힌다.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { companyName } from '@/lib/company';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import type { DailyLine } from './daily-data';
import type { RetirementCase } from './retirement-data';
import type { RunRow } from './run-data';
import { buildSlipPdf, type SlipPdfLabels, type SlipPdfLine } from './slip-pdf';

type T = Awaited<ReturnType<typeof getTranslations>>;
const lastDay = (periodTo: string) => new Date(Date.parse(`${periodTo}T00:00:00Z`) - 86400000).toISOString().slice(0, 10); // 대장의 끝은 다음 날 0시로 저장돼 있다

function labels(t: T, nf: Intl.NumberFormat, o: { title: string; period: string; payDate: string; group: string; note: string; draft: string | null; practice: boolean; correction: string | null }): SlipPdfLabels {
  return {
    title: o.title, company: t('hCompany'), no: t('hNo'), name: t('hName'), group: o.group, period: o.period, payDate: o.payDate, revision: t('hRevision'),
    pay: t('pay'), deduction: t('deduction'), item: t('item'), how: t('how'), amount: t('amount'), payTotal: t('payTotal'), deductionTotal: t('deductionTotal'), net: t('net'), none: t('none'),
    draft: o.draft, practice: o.practice ? t('practice') : null, correction: o.correction, note: o.note, page: (n, all) => t('page', { n, all }), money: (n) => t('won', { n: nf.format(n) }),
  };
}

/** 일용 대장의 한 사람 지급명세서 — 계산이 끝난(OK) 줄만 */
export async function dailyPdfBytes(run: RunRow, l: DailyLine, locale = 'ko'): Promise<{ bytes: Uint8Array; file: string }> {
  if (l.state !== 'OK' || l.gross === null || l.net === null) throw new Error('daily line not calculated');
  const t = await getTranslations({ locale, namespace: 'paperPdf' });
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const month = run.periodFrom.slice(0, 7);
  const lines: SlipPdfLine[] = [
    ...l.days.map((d) => ({ kind: 'PAYMENT' as const, label: d.workDate, how: null, amount: d.gross })),
    { kind: 'DEDUCTION', label: t('d.incomeTax'), how: t('d.taxHow'), amount: l.incomeTax ?? 0 },
    { kind: 'DEDUCTION', label: t('d.localTax'), how: null, amount: l.localTax ?? 0 },
    ...(l.otherDeduction ? [{ kind: 'DEDUCTION' as const, label: t('d.other'), how: null, amount: l.otherDeduction }] : []),
  ];
  const deduction = (l.incomeTax ?? 0) + (l.localTax ?? 0) + (l.otherDeduction ?? 0);
  const bytes = await buildSlipPdf({
    company: await companyName(), no: `D${month.replace('-', '')}-${run.sequence}-${l.internalNo}`, name: l.name, employeeNo: l.internalNo, group: t('d.groupValue'),
    periodFrom: run.periodFrom, periodTo: lastDay(run.periodTo), payDate: run.payDate, revision: run.revision, pay: l.gross, deduction, net: l.net, lines,
    work: { title: t('d.workTitle'), rows: [[t('d.workDays'), nf.format(l.workDays ?? 0)], [t('d.taxable'), t('won', { n: nf.format(l.taxable ?? 0) })], [t('d.nontax'), t('won', { n: nf.format(l.nontax ?? 0) })]] },
    labels: labels(t, nf, {
      title: t('d.title', { month }), period: t('d.period'), payDate: t('hPayDate'), group: t('d.group'), note: t('d.note'),
      draft: run.status !== 'FINALIZED' ? t('draft') : null, practice: run.isTest, correction: run.revision > 1 ? t('corrected', { reason: run.correctionReason ?? '' }) : null,
    }),
  });
  return { bytes, file: `${t('d.file')}_${month.replace('-', '')}_${l.internalNo.replace(/[^\w가-힣-]/g, '')}_rev${run.revision}.pdf` };
}

/** 퇴직급여 한 건의 계산서 — 금액이 나온 건만 */
export async function retirementPdfBytes(k: RetirementCase, who: { name: string; employeeNo: string | null; groupId: string | null }, locale = 'ko'): Promise<{ bytes: Uint8Array; file: string }> {
  if (k.amount === null) throw new Error('retirement amount missing');
  const [t, groups] = await Promise.all([getTranslations({ locale, namespace: 'paperPdf' }), loadOrgGroups()]);
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const won = (v: number | string | null) => (v === null ? '—' : t('won', { n: nf.format(Number(v)) }));
  const i = k.input, r = k.result;
  const dep = i.departureInsurance ?? null;
  const lines: SlipPdfLine[] = [
    { kind: 'PAYMENT', label: t(`r.kind.${k.kind}`), how: r.dailyUsed === null || r.serviceDays === null ? null : t('r.how', { basis: t(r.usedOrdinary ? 'r.usedOrdinary' : 'r.usedAverage'), daily: nf.format(Number(r.dailyUsed)), days: nf.format(r.serviceDays) }), amount: k.amount },
    ...(dep ? [{ kind: 'DEDUCTION' as const, label: t('r.departure'), how: t('r.departureHow'), amount: dep }] : []),
    ...(k.taxAmount ? [{ kind: 'DEDUCTION' as const, label: t('r.tax'), how: k.taxBasis, amount: k.taxAmount }] : []),
  ];
  const deduction = (dep ?? 0) + (k.taxAmount ?? 0);
  const made = (k.finalizedAt ?? k.createdAt).slice(0, 10);
  const bytes = await buildSlipPdf({
    company: await companyName(), no: `R-${k.id.slice(0, 8).toUpperCase()}`, name: who.name, employeeNo: who.employeeNo ?? '', group: groupPath(groups, who.groupId) ?? '',
    periodFrom: k.periodFrom, periodTo: k.periodTo, payDate: made, revision: k.revision, pay: k.amount, deduction, net: Math.max(0, k.amount - deduction), lines,
    work: {
      title: t('r.workTitle'),
      rows: [
        [t('r.serviceDays'), r.serviceDays === null ? '—' : t('days', { n: nf.format(r.serviceDays) })], [t('r.wage3m'), won(i.wage3m)], [t('r.days3m'), i.days3m === null ? '—' : t('days', { n: i.days3m })],
        [t('r.bonus1y'), won(i.bonus1y)], [t('r.leavePay1y'), won(i.leavePay1y)], [t('r.average'), won(r.averageDaily)],
        [t('r.ordinary'), won(i.ordinaryDaily)], [t('r.used'), won(r.dailyUsed)],
      ],
    },
    labels: labels(t, nf, {
      title: t('r.title', { kind: t(`r.kind.${k.kind}`) }), period: t('r.period'), payDate: t(k.finalizedAt ? 'r.finalizedOn' : 'r.madeOn'), group: t('hGroup'), note: t('r.note'),
      draft: k.state === 'DRAFT' ? t('draft') : k.state === 'WITHDRAWN' ? t('r.withdrawn') : null, practice: k.isTest, correction: k.revision > 1 ? t('r.revised', { n: k.revision }) : null,
    }),
  });
  return { bytes, file: `${t('r.file')}_${(who.employeeNo ?? '').replace(/[^\w가-힣-]/g, '')}_${k.periodTo.replace(/-/g, '')}_rev${k.revision}.pdf` };
}

export function pdfResponse(bytes: Uint8Array, file: string, asciiName: string, requestId: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
      'x-request-id': requestId,
    },
  });
}
