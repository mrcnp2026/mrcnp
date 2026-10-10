// 반경 밖 「출근/퇴근 요청」 판단 (의뢰인 2026-10-10 확정: 시프티 방식). 순수함수.
// 사무실 인터넷도 아니고 출퇴근 장소 반경 안도 아닌 곳에서 찍으면 기록이 아니라 요청이 된다 — 관리자가 승인해야 기록된다.
export type GeoReason = 'outside' | 'no_fix' | 'low_accuracy' | 'no_office' | 'no_consent';

/**
 * 지금 누른 출퇴근을 바로 기록할지('record'), 요청으로 돌릴지('request').
 *   · 확인됐으면(사무실 인터넷 · 장소 반경 안) 기록
 *   · 회사에 사무실 인터넷·출퇴근 장소가 하나도 등록돼 있지 않으면 기록 (확인할 기준이 없다 — 전원이 요청으로 가지 않게)
 *   · 그날 승인된 외근·출장·재택이 있으면 기록 (밖에서 일하기로 이미 승인받았다)
 *   · 그 밖에는 요청
 */
export function punchRoute(args: { verified: boolean; hasOfficeSetup: boolean; approvedAway: boolean }): 'record' | 'request' {
  if (args.verified || !args.hasOfficeSetup || args.approvedAway) return 'record';
  return 'request';
}

/** 확인하지 못한 이유 — 요청에 적어 관리자가 판단할 때 본다 */
export function geoReasonOf(args: { consent: boolean; hasCoords: boolean; verdict: 'ok' | 'no_office' | 'no_fix' | 'low_accuracy' | 'outside' | null }): GeoReason {
  if (!args.consent) return 'no_consent';
  if (!args.hasCoords || !args.verdict || args.verdict === 'no_fix') return 'no_fix';
  if (args.verdict === 'ok') return 'outside';
  return args.verdict;
}
