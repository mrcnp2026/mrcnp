// 개인정보·위치정보 수집 동의 — 안내문의 판(version). 안내문(messages의 consent.*)을 고치면 이 값을 올린다:
// 올리면 모든 직원에게 동의 창이 다시 뜬다 (이전 판의 동의 기록은 그대로 남는다 — DB 0018).
// ⚠️ 안내문은 개발 단계 초안이다. 운영 전에 노무·개인정보 검토를 받는다 (요청서 D 구역, 부록 R-14).
export const CONSENT = { kind: 'privacy_location', version: '2026-10-05-3' } as const;
