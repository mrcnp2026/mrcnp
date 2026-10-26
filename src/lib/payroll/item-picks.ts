// 항목 등록 안내에서 고를 수 있는 자주 쓰는 항목 — 값은 통상 기준의 임시 값(담당자가 확인)
export type ItemPick = { ko: string; en: string; calc: 'FIXED' | 'MANUAL' | 'TIME'; tax?: 'TAXABLE' | 'PARTIAL'; limit?: string; regular?: 'YES' | 'NO' };
export const PAY_PICKS: ItemPick[] = [
  { ko: '직책수당', en: 'Position allowance', calc: 'FIXED', regular: 'YES' },
  { ko: '직무수당', en: 'Job allowance', calc: 'FIXED', regular: 'YES' },
  { ko: '자격수당', en: 'Certification allowance', calc: 'FIXED', regular: 'YES' },
  { ko: '식대', en: 'Meal allowance', calc: 'FIXED', tax: 'PARTIAL', limit: '200000', regular: 'YES' },
  { ko: '통신비', en: 'Phone allowance', calc: 'FIXED', regular: 'YES' },
  { ko: '성과급', en: 'Incentive bonus', calc: 'MANUAL', regular: 'NO' },
  { ko: '명절상여', en: 'Holiday bonus', calc: 'MANUAL', regular: 'NO' },
  { ko: '자가운전보조금', en: 'Own-car allowance', calc: 'FIXED', tax: 'PARTIAL', limit: '200000', regular: 'NO' },
  { ko: '연구활동비', en: 'Research allowance', calc: 'FIXED', tax: 'PARTIAL', limit: '200000', regular: 'NO' },
  { ko: '출산·보육수당', en: 'Childbirth & childcare allowance', calc: 'FIXED', tax: 'PARTIAL', limit: '200000', regular: 'NO' },
];
export const DED_PICKS: ItemPick[] = [
  { ko: '가불', en: 'Salary advance', calc: 'MANUAL' },
  { ko: '대출상환', en: 'Loan repayment', calc: 'MANUAL' },
  { ko: '상조회비', en: 'Mutual aid fee', calc: 'FIXED' },
  { ko: '사우회비', en: 'Staff club fee', calc: 'FIXED' },
  { ko: '노동조합비', en: 'Union fee', calc: 'FIXED' },
  { ko: '기부금', en: 'Donation', calc: 'MANUAL' },
];

/**
 * 이름만 보고 과세 구분을 짐작한다 (2026-10-26 의뢰인: 직접 만들 때 「추천」으로만 알려 주고 고르는 건 사람이 한다).
 * 한도는 소득세법 시행령 기준 임시 값 — 세무 담당자가 확인한다. 짐작이 안 되면 null(추천 없음).
 */
export type TaxGuess = { tax: 'TAXABLE' | 'PARTIAL'; limit?: string };
const GUESSES: { re: RegExp; guess: TaxGuess }[] = [
  { re: /식대|식비|급식|중식|석식/, guess: { tax: 'PARTIAL', limit: '200000' } },
  { re: /자가\s*운전|차량\s*유지|본인\s*차량|교통\s*보조/, guess: { tax: 'PARTIAL', limit: '200000' } },
  { re: /출산|보육|육아|자녀\s*양육/, guess: { tax: 'PARTIAL', limit: '200000' } },
  { re: /연구\s*활동|연구\s*보조|연구\s*수당/, guess: { tax: 'PARTIAL', limit: '200000' } },
  { re: /취재|기자/, guess: { tax: 'PARTIAL', limit: '200000' } },
  { re: /수당|상여|성과|보너스|인센티브|급여|직책|직무|자격|명절|통신/, guess: { tax: 'TAXABLE' } },
];
/** 이름만 보고 퇴직금 평균임금 구분을 짐작한다 — 「추천」으로 알려 주기만 하고 고르는 건 사람이 한다 (묶음 36). 짐작이 안 되면 null */
export type AverageGuess = 'MONTHLY' | 'BONUS';
export function guessAverageKind(name: string): AverageGuess | null {
  const n = name.trim();
  if (!n) return null;
  if (/성과|상여|보너스|인센티브|명절|격려|포상/.test(n)) return 'BONUS';
  if (/식대|식비|직책|직무|자격|통신|수당|기본급|급여|연장|야간|휴일|시간외/.test(n)) return 'MONTHLY';
  return null;
}
export function guessTax(name: string): TaxGuess | null {
  const n = name.trim();
  if (!n) return null;
  return GUESSES.find((g) => g.re.test(n))?.guess ?? null;
}
