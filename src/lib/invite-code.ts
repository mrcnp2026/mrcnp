// 짧은 등록 코드 (2026-10-02 의뢰인 요청: 주소창에 직접 입력해 등록할 수 있게).
// 8자 = 헷갈리는 글자(0/O, 1/I/L)를 뺀 31자 × 8자리 ≈ 40비트. 72시간 안에 서버에 하나씩 넣어 맞히는 것은 불가능한 크기다.
// 링크(QR)와 손으로 입력하는 코드가 **같은 초대**다 — 토큰 자체가 이 코드다. DB에는 지문(sha256)만 저장한다.
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** 화면에 보일 모양: XXXX-XXXX */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * 입력값 정리: 짧은 코드면 공백·하이픈을 빼고 대문자로 (사람이 "k7p2 9qxa"로 쳐도 된다).
 * 예전에 발급한 긴 토큰(43자 base64url)은 대소문자를 구분하므로 그대로 둔다.
 */
export function normalizeInviteToken(raw: string): string {
  const compact = raw.trim().replace(/[\s-]/g, '');
  return compact.length <= 12 ? compact.toUpperCase() : raw.trim();
}
