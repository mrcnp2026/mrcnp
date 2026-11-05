// 받는 파일 이름 — 「2026년 10월 급여대장.xlsx」처럼 사람이 읽는 한국어로 (2026-11-05 의뢰인). 대장 엑셀 · 대장 PDF · 명세서 PDF가 같은 규칙.
//   상여면 「상여 2차」, 정정본이면 「(정정 1차)」, 확정 전이면 「(검토용)」이 붙는다. 파일은 회사 안 문서라 한국어로 고정.
import 'server-only';
import { getTranslations } from 'next-intl/server';

export async function payFileName(o: { ym: string; doc: 'ledger' | 'slips'; who?: string | null; bonusSeq?: number | null; revision: number; draft: boolean; ext: 'xlsx' | 'pdf' }): Promise<string> {
  const t = await getTranslations({ locale: 'ko', namespace: 'admin.payRuns.file' });
  const base = t('name', { y: o.ym.slice(0, 4), m: String(+o.ym.slice(5, 7)), doc: t(o.doc) });
  const who = o.who ? ` ${o.who.replace(/[\\/:*?"<>|]/g, '')}` : '';
  const tail = `${o.bonusSeq ? t('bonus', { n: o.bonusSeq }) : ''}${o.revision > 1 ? t('fix', { n: o.revision - 1 }) : ''}${o.draft ? t('draft') : ''}`;
  return `${base}${who}${tail}.${o.ext}`;
}
