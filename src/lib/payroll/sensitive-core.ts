// 주민번호 · 외국인등록번호 · 여권번호 · 계좌번호 — 모양 확인 · 가리기 · 암호화 (급여-36 · 37). DB와 상관없는 부분만(시험이 바로 부른다).
// 열쇠 하나(PAYROLL_SECRET_KEY, 32바이트 base64)에서 암호 열쇠와 찾기 열쇠를 따로 뽑는다(HKDF). 암호는 AES-256-GCM, 줄마다 새 시작값.
// 암호문에는 「종류 · 주인」을 묶어(AAD) 다른 줄 · 다른 사람에게 옮겨 붙이면 풀리지 않는다.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

export const SENSITIVE_KINDS = ['RRN', 'FOREIGN_NO', 'PASSPORT', 'BANK'] as const;
export type SensitiveKind = (typeof SENSITIVE_KINDS)[number];
// shortcut: 열쇠 판은 1 하나뿐, 열쇠를 바꿔야 할 때 판별 열쇠 목록 + 다시 잠그기 스크립트를 만든다
export const KEY_VERSION = 1;
export const GRANT_DAYS = [7, 30, 90, 365]; // 원문 보기 허락 기한(일) 고르기 — DB는 366일까지 받는다

type Parsed = { ok: true; value: string; masked: string } | { ok: false; code: 'sensitive_invalid' };
const bad = { ok: false, code: 'sensitive_invalid' } as const;

// 앞 6자리 생년월일 + 7번째 성별 · 세기 숫자. 2020-10 이후 번호는 뒷자리가 무작위라 끝자리 검사식은 쓰지 않는다
function idNumber(raw: string, digits7: string): Parsed {
  const v = raw.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(v) || !digits7.includes(v[6])) return bad;
  const year = ('1256'.includes(v[6]) ? 1900 : 2000) + Number(v.slice(0, 2));
  const [m, d] = [Number(v.slice(2, 4)), Number(v.slice(4, 6))];
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return bad;
  return { ok: true, value: v, masked: `${v.slice(0, 6)}-${v[6]}******` };
}

export function parseSensitive(kind: SensitiveKind, raw: unknown, bank?: unknown): Parsed {
  if (typeof raw !== 'string' || raw.length > 60) return bad;
  if (kind === 'RRN') return idNumber(raw, '1234');
  if (kind === 'FOREIGN_NO') return idNumber(raw, '5678');
  if (kind === 'PASSPORT') {
    const v = raw.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(v) || !/\d/.test(v)) return bad;
    return { ok: true, value: v, masked: `${v[0]}${'*'.repeat(v.length - 3)}${v.slice(-2)}` };
  }
  const name = typeof bank === 'string' ? bank.trim().replace(/\s+/g, ' ') : '';
  const v = raw.replace(/[\s-]/g, '');
  if (name.length < 1 || name.length > 20 || !/^\d{8,20}$/.test(v)) return bad;
  return { ok: true, value: v, masked: `${name} ****${v.slice(-4)}` };
}

export type SensitiveKeys = { enc: Buffer; mac: Buffer };
export function keysOf(secret: string): SensitiveKeys {
  const master = Buffer.from(secret, 'base64');
  if (master.length !== 32) throw new Error('payroll_secret_key_invalid'); // 값은 오류에 넣지 않는다
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
  return { enc: derive('payroll-sensitive-enc'), mac: derive('payroll-sensitive-lookup') };
}

const aad = (kind: SensitiveKind, owner: string) => Buffer.from(`${kind}:${owner}`);

/** 모양: base64(시작값 12 · 확인값 16 · 암호문) */
export function seal(keys: SensitiveKeys, kind: SensitiveKind, owner: string, value: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keys.enc, iv);
  c.setAAD(aad(kind, owner));
  const body = Buffer.concat([c.update(value, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

/** 열쇠가 다르거나 · 다른 줄에서 옮겨 왔거나 · 한 글자라도 바뀌면 던진다 */
export function open(keys: SensitiveKeys, kind: SensitiveKind, owner: string, sealed: string): string {
  const b = Buffer.from(sealed, 'base64');
  const d = createDecipheriv('aes-256-gcm', keys.enc, b.subarray(0, 12));
  d.setAAD(aad(kind, owner));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** 같은 번호인지 찾는 값 — 열쇠가 있어야 만들 수 있어 번호를 맞혀 보기로 거꾸로 찾지 못한다 */
export const lookupOf = (keys: SensitiveKeys, kind: SensitiveKind, value: string) => createHmac('sha256', keys.mac).update(`${kind}:${value}`).digest('hex');
