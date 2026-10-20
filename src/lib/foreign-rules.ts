// 외국인 직원 — 입력 검사와 보험 · 세금 「제안」 (묶음 31, 2026-10-20 의뢰인: 태국 · 베트남 직원). 순수 함수.
// ★ 제안만 한다. 보험 가입 여부는 담당자가 사원별 급여 › 세무에서 근거를 적고 정한다(자동으로 바꾸지 않는다).
// ★ 나라별 국민연금 적용은 상호주의라 해마다 바뀔 수 있다. 확인되지 않은 나라는 「공단 확인」으로 둔다 — 검증 대기 기록.

export type ForeignInfo = { nationality: string | null; visaType: string | null; stayUntil: string | null; firstWorkInKorea: string | null; englishName?: string | null; activityPermitUntil?: string | null; immigrationVisitOn?: string | null; dormitory?: string | null }; // 뒤 네 칸: 묶음 32
export const EMPTY_FOREIGN: ForeignInfo = { nationality: null, visaType: null, stayUntil: null, firstWorkInKorea: null, englishName: null, activityPermitUntil: null, immigrationVisitOn: null, dormitory: null };

/** 고를 수 있는 나라 (자주 쓰는 순). 목록에 없으면 「기타」로 두 글자 코드를 직접 넣는다 */
export const COUNTRIES = ['TH', 'VN', 'CN', 'PH', 'ID', 'UZ', 'KH', 'MM', 'NP', 'MN', 'LK', 'BD', 'PK', 'KG', 'TL', 'LA', 'US'] as const;
/** 자주 쓰는 체류 자격 */
export const VISAS = ['E-9', 'H-2', 'E-7', 'E-7-4', 'F-2', 'F-4', 'F-5', 'F-6', 'D-2', 'D-10', 'G-1'] as const;

/**
 * 국민연금 — 나라별 상호주의. 공단 자료로 확인한 나라만 YES/NO, 나머지는 CHECK.
 * 태국 · 베트남: 2026-10-20 찾은 자료끼리 서로 달라(당연적용 제외국 목록에 한쪽만 들어감) 확정하지 않는다 → 공단 확인 뒤 여기 적는다.
 */
const PENSION_BY_COUNTRY: Partial<Record<string, 'YES' | 'NO'>> = {};

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function cleanForeign(b: Record<string, unknown>, today: string): ForeignInfo | { error: string } {
  const pick = (v: unknown) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v.trim().toUpperCase() : undefined);
  const nationality = pick(b.nationality);
  if (nationality === undefined || (nationality !== null && !/^[A-Z]{2}$/.test(nationality))) return { error: 'foreign_nationality' };
  if (nationality === 'KR' || nationality === null) return EMPTY_FOREIGN; // 내국인 — 나머지 칸은 버린다
  const visaType = pick(b.visaType);
  if (visaType === undefined || (visaType !== null && !/^[A-Z][0-9A-Z-]{0,9}$/.test(visaType))) return { error: 'foreign_visa' };
  const date = (v: unknown) => (v === undefined || v === null || v === '' ? null : isDate(v) ? v : undefined);
  const stayUntil = date(b.stayUntil), firstWorkInKorea = date(b.firstWorkInKorea);
  if (stayUntil === undefined) return { error: 'foreign_stay' };
  if (firstWorkInKorea === undefined || (firstWorkInKorea !== null && (firstWorkInKorea < '1950-01-01' || firstWorkInKorea > today))) return { error: 'foreign_first_work' };
  // 묶음 32: 영어 이름(여권 표기) · 활동허가 만료일 · 출입국 방문 예약일 · 숙소
  const plain = (v: unknown, max: number) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined);
  const englishName = plain(b.englishName, 60), dormitory = plain(b.dormitory, 100);
  if (englishName === undefined || (englishName !== null && !/^[A-Za-z][A-Za-z .,'-]*$/.test(englishName))) return { error: 'foreign_english_name' };
  if (dormitory === undefined) return { error: 'foreign_dormitory' };
  const activityPermitUntil = date(b.activityPermitUntil), immigrationVisitOn = date(b.immigrationVisitOn);
  if (activityPermitUntil === undefined || immigrationVisitOn === undefined) return { error: 'foreign_stay' };
  return { nationality, visaType, stayUntil, firstWorkInKorea, englishName: englishName ? englishName.toUpperCase() : null, activityPermitUntil, immigrationVisitOn, dormitory };
}

export type Suggest = 'YES' | 'NO' | 'CHECK' | 'ON_REQUEST';
export type ForeignSuggestion = {
  pension: Suggest;
  health: Suggest;
  employment: Suggest;
  accident: Suggest;
  flatTax: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NEED_FIRST_WORK';
  departureInsurance: boolean; // E-9 · H-2: 출국만기보험이 퇴직금을 대신한다
};

/**
 * 보험 · 세금 제안.
 * - 건강 · 산재: 외국인도 직장가입(국민건강보험법 제109조) · 산재는 모든 근로자.
 * - 고용: F-2 · F-5 · F-6은 내국인과 같다. 그 밖의 취업 자격은 본인이 신청하면 가입(고용보험법 제10조의2 · 시행령 제3조) — E-9 · H-2의 고용안정 · 직업능력개발은 회사 부담만 있다.
 * - 국민연금: 나라별 상호주의(국민연금법 제126조). 확인된 나라만 YES/NO.
 * - 단일세율 19%(조세특례제한법 제18조의2): 2026-12-31 전에 국내에서 처음 일한 외국인, 그날부터 20년이 되는 해까지. 본인 신청이 있어야 한다.
 */
export function suggestForeign(f: ForeignInfo, today: string): ForeignSuggestion | null {
  if (!f.nationality) return null;
  const v = f.visaType ?? '';
  const resident = v === 'F-2' || v === 'F-5' || v === 'F-6';
  let flatTax: ForeignSuggestion['flatTax'] = 'NEED_FIRST_WORK';
  if (f.firstWorkInKorea) {
    const lastYear = Number(f.firstWorkInKorea.slice(0, 4)) + 19; // 처음 일한 해 포함 20개 과세연도
    flatTax = f.firstWorkInKorea <= '2026-12-31' && Number(today.slice(0, 4)) <= lastYear ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
  }
  return {
    pension: PENSION_BY_COUNTRY[f.nationality] ?? 'CHECK',
    health: 'YES',
    employment: resident ? 'YES' : 'ON_REQUEST',
    accident: 'YES',
    flatTax,
    departureInsurance: v === 'E-9' || v === 'H-2',
  };
}

/** 체류 기간이 끝나기까지 남은 날 (지났으면 음수). 없으면 null */
export function daysToStayEnd(stayUntil: string | null, today: string): number | null {
  if (!stayUntil) return null;
  return Math.round((Date.parse(`${stayUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
export const STAY_ALERT_DAYS = [60, 30] as const;
