// 사무실 여부 판정 (7-3, 부록 R-6). 순수함수.
// ★ IP는 서버(출퇴근 API)에서만 읽는다. 브라우저가 보내는 값을 믿지 않는다 (요점 1).
// ★ 판정에 실패해도 기록은 막지 않는다 — ip_verified=false로 남기고 관리자가 판단한다 (4-3).
import ipaddr from 'ipaddr.js';

export type IpTrace = {
  headers: Record<string, string | null>; // 판정 후보 헤더 전체 — 진단 화면(/admin/diag)에 그대로 보인다 (요점 2)
  usedHeader: string | null;
  ip: string | null;
};

/** 헤더 순서대로 처음 있는 값의 맨 앞 주소. 체인 전체는 trace에 남긴다 */
export function traceClientIp(headers: Headers, order: readonly string[]): IpTrace {
  const seen: Record<string, string | null> = {};
  for (const h of order) seen[h] = headers.get(h);
  for (const h of order) {
    const raw = seen[h];
    if (!raw) continue;
    const first = normalize(raw.split(',')[0]);
    if (first) return { headers: seen, usedHeader: h, ip: first };
  }
  return { headers: seen, usedHeader: null, ip: null };
}

export function extractClientIp(headers: Headers, order: readonly string[]): string | null {
  return traceClientIp(headers, order).ip;
}

/** 주소 문자열을 표준형으로. IPv4가 IPv6 모양(::ffff:1.2.3.4)으로 오면 IPv4로 바꾼다. 이상한 값은 null */
export function normalize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^\[|\](:\d+)?$/g, ''); // [IPv6]:port
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(s)) s = s.replace(/:\d+$/, ''); // IPv4:port
  if (!ipaddr.isValid(s)) return null;
  const a = ipaddr.parse(s);
  if (a.kind() === 'ipv6' && (a as ipaddr.IPv6).isIPv4MappedAddress()) return (a as ipaddr.IPv6).toIPv4Address().toString();
  return a.toString();
}

/**
 * 등록된 대역(CIDR) 중 하나에 들어가는가. IPv4·IPv6 둘 다 (B-3: 사무실 회선이 IPv6를 주면 IPv4 대역과는 절대 안 맞는다).
 * 대역 표기가 잘못된 항목은 건너뛴다 — 하나가 틀렸다고 전원이 실패하지 않게. 잘못된 항목은 진단 화면에 따로 보인다.
 */
export function isOfficeIp(ip: string | null, cidrs: readonly string[]): boolean {
  const n = normalize(ip);
  if (!n) return false;
  const addr = ipaddr.parse(n);
  for (const c of cidrs) {
    const range = parseCidr(c);
    if (range && addr.kind() === range[0].kind() && addr.match(range)) return true;
  }
  return false;
}

/** 'a.b.c.d/nn' 또는 IPv6/nn. 슬래시가 없으면 단일 주소(/32, /128)로 본다 */
export function parseCidr(c: string): [ipaddr.IPv4 | ipaddr.IPv6, number] | null {
  const s = c.trim();
  try {
    if (s.includes('/')) return ipaddr.parseCIDR(s);
    const a = ipaddr.parse(s);
    return [a, a.kind() === 'ipv4' ? 32 : 128];
  } catch {
    return null;
  }
}
