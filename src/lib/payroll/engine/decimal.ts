// 급여 계산용 정밀 소수 (PRD v1.3 7.3 · 21.1). 소수 여덟째 자리까지를 큰 정수 하나로 들고 계산한다 — 0.1 + 0.2 같은 소수 오차가 쌓이지 않는다.
// 값은 글자로 주고받는다("333.33", "0.045"). 원 단위로 끊는 것은 맨 끝에 한 번, 항목마다 정한 방식으로 한다.
// (이 프로젝트의 컴파일 설정에서는 123n 꼴을 쓸 수 없어 BigInt(…)로 적는다)
const SCALE = BigInt(100_000_000); // 10^8
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const abs = (v: bigint) => (v < ZERO ? -v : v);

export type Dec = bigint;
export type RoundMode = 'HALF_UP' | 'FLOOR' | 'CEIL';
export type Rounding = { mode: RoundMode; unit: number }; // unit: 1 = 원 단위, 10 = 10원 미만 처리, 1000 = 천 원 미만 처리

/** "1234.5" · 1234 · "-0.045" → Dec. 소수 아홉째 자리부터는 받지 않는다(조용히 버리지 않는다) */
export function dec(v: string | number | bigint): Dec {
  if (typeof v === 'bigint') return v * SCALE;
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new Error(`dec: only whole numbers may be passed as number (${v}) — pass decimals as text`);
    return BigInt(v) * SCALE;
  }
  const m = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(v.trim());
  if (!m) throw new Error(`dec: not a decimal with up to 8 places (${v})`);
  const n = BigInt(m[2]) * SCALE + BigInt((m[3] ?? '').padEnd(8, '0'));
  return m[1] ? -n : n;
}
export const isDecText = (v: unknown): v is string => typeof v === 'string' && /^-?\d+(\.\d{1,8})?$/.test(v.trim());

export const add = (a: Dec, b: Dec): Dec => a + b;
export const sub = (a: Dec, b: Dec): Dec => a - b;
/** 반올림 나눗셈(절반은 0에서 멀어지는 쪽) — 중간 계산의 여덟째 자리 아래만 정리한다 */
function divRound(n: bigint, d: bigint): bigint {
  const q = n / d;
  const r = n % d;
  return abs(r) * TWO >= abs(d) ? q + ((n < ZERO) !== (d < ZERO) ? -ONE : ONE) : q;
}
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE);
export function div(a: Dec, b: Dec): Dec {
  if (b === ZERO) throw new Error('dec: division by zero');
  return divRound(a * SCALE, b);
}
export const min = (a: Dec, b: Dec): Dec => (a < b ? a : b);
export const max = (a: Dec, b: Dec): Dec => (a > b ? a : b);
export const isZero = (a: Dec) => a === ZERO;
export const isNeg = (a: Dec) => a < ZERO;

/** 원 단위 정수로 끊는다. FLOOR · CEIL은 수직선 기준(음수 −10.5 → FLOOR −11) */
export function toWon(a: Dec, r: Rounding = { mode: 'HALF_UP', unit: 1 }): bigint {
  if (!Number.isInteger(r.unit) || r.unit < 1) throw new Error('dec: bad rounding unit');
  const d = SCALE * BigInt(r.unit);
  const q = a / d; // 0 쪽으로 버린 몫
  const rem = a % d;
  let out = q;
  if (rem !== ZERO) {
    if (r.mode === 'FLOOR') out = a < ZERO ? q - ONE : q;
    else if (r.mode === 'CEIL') out = a < ZERO ? q : q + ONE;
    else out = abs(rem) * TWO >= d ? q + (a < ZERO ? -ONE : ONE) : q;
  }
  return out * BigInt(r.unit);
}

/** Dec → 글자. 끝의 0은 뗀다 ("999.99", "1000") */
export function text(a: Dec): string {
  const v = abs(a);
  const frac = (v % SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return `${a < ZERO ? '-' : ''}${v / SCALE}${frac ? `.${frac}` : ''}`;
}
/** 분 → 시간(Dec). 525분 = 8.75시간 */
export const hoursOf = (minutes: number): Dec => div(dec(minutes), dec(60));
