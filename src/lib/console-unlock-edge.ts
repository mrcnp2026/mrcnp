// 통합설정 열림 표 확인 — 미들웨어(에지)용. lib/console-pin.ts의 makeUnlock과 같은 서명을 Web Crypto로 다시 계산한다.
// 표: 「직원 id . 끝나는 때(ms) . 서명(base64url)」, 서명 열쇠 = HMAC-SHA256(서비스 키, 'console-pin-unlock')
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(keyBytes: ArrayBuffer | Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

export async function unlockValidEdge(value: string | undefined, employeeId: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !employeeId) return false;
  const [id, exp, sig] = value.split('.');
  if (id !== employeeId || !exp || !sig || Number(exp) < now) return false;
  const key = await hmac(enc.encode(process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''), 'console-pin-unlock');
  const want = b64url(await hmac(key, `${id}.${exp}`));
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
