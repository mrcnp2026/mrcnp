// 접속 기록 (2026-10-29 남은 일 9-5, DB 묶음 40 login_events) — 로그인 성공 · 실패를 남기고 관리자가 「이력 · 내역 › 접속 기록」에서 본다. 서버 전용.
// 개인정보 안전성 확보조치 기준의 접속 기록 — 보관 2년(결정 운영-3 임시). 입력한 아이디 원문은 남기지 않고 지문값만.
// 기록에 실패해도 로그인은 막지 않는다(기록 오류는 오류 기록에만 남긴다).
import 'server-only';
import { createHash } from 'node:crypto';
import { OFFICE } from '@/config/office';
import { normalizeLoginId } from '@/lib/login-rules';
import { createAdminClient } from '@/lib/supabase/admin';
import { traceClientIp } from '@/lib/verify-location';

export type LoginResult = 'OK' | 'FAIL' | 'THROTTLED';
export type LoginMethod = 'PASSWORD' | 'PASSKEY';
export type LoginEvent = { id: number; employeeId: string | null; method: LoginMethod; result: LoginResult; clientIp: string | null; userAgent: string | null; createdAt: string };

export async function recordLogin(args: { employeeId: string | null; rawId?: unknown; method: LoginMethod; result: LoginResult; headers: Headers }): Promise<void> {
  try {
    const key = args.rawId === undefined ? null : createHash('sha256').update(normalizeLoginId(args.rawId)).digest('hex');
    const ua = args.headers.get('user-agent');
    const { error } = await createAdminClient().from('login_events').insert({
      employee_id: args.employeeId,
      login_key: key,
      method: args.method,
      result: args.result,
      client_ip: traceClientIp(args.headers, OFFICE.ipHeaderOrder).ip?.slice(0, 64) ?? null,
      user_agent: ua ? ua.slice(0, 300) : null,
    });
    if (error && error.code !== '42P01') console.error(`recordLogin: ${error.code}`); // 42P01: 표가 아직 없는 DB(묶음 40 적용 전)
  } catch (e) {
    console.error('recordLogin', e instanceof Error ? e.message : e);
  }
}

/** 최근 접속 기록 — 사람 · 결과로 고른다. 표가 없으면 빈 목록과 missing=true */
export async function loadLoginEvents(opts: { employeeId?: string | null; result?: LoginResult | null; since: string; limit?: number }): Promise<{ rows: LoginEvent[]; missing: boolean }> {
  let q = createAdminClient().from('login_events').select('id, employee_id, method, result, client_ip, user_agent, created_at').gte('created_at', opts.since).order('created_at', { ascending: false }).limit(opts.limit ?? 500);
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts.result) q = q.eq('result', opts.result);
  const { data, error } = await q;
  if (error?.code === '42P01') return { rows: [], missing: true };
  if (error) throw new Error(`loadLoginEvents: ${error.code}`);
  return {
    rows: (data ?? []).map((r) => ({ id: r.id as number, employeeId: r.employee_id as string | null, method: r.method as LoginMethod, result: r.result as LoginResult, clientIp: r.client_ip as string | null, userAgent: r.user_agent as string | null, createdAt: r.created_at as string })),
    missing: false,
  };
}

/** 접속 기록 점검함 — 회사 정보 이력 줄에 남긴다(DB 변경 없음). 최근 24번 */
export async function markAccessReviewed(actorId: string): Promise<void> {
  const { companyProfile, putCompanyProfile } = await import('@/lib/company');
  const prev = (await companyProfile()).accessReviews ?? [];
  await putCompanyProfile({ accessReviews: [{ at: new Date().toISOString(), by: actorId }, ...prev].slice(0, 24) }, actorId);
}

export type DownloadRow = { id: number; actorId: string; kind: string; fileName: string; purpose: string | null; createdAt: string };
export type ChangeRow = { id: number; actorId: string | null; action: string; table: string; targetId: string | null; reason: string | null; createdAt: string };

export async function loadDownloads(since: string, actorId: string | null): Promise<DownloadRow[]> {
  let q = createAdminClient().from('download_logs').select('id, actor_id, kind, file_name, purpose, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
  if (actorId) q = q.eq('actor_id', actorId);
  const { data, error } = await q;
  if (error) throw new Error(`loadDownloads: ${error.code}`);
  return (data ?? []).map((r) => ({ id: r.id as number, actorId: r.actor_id as string, kind: r.kind as string, fileName: r.file_name as string, purpose: r.purpose as string | null, createdAt: r.created_at as string }));
}

export async function loadChanges(since: string, actorId: string | null): Promise<ChangeRow[]> {
  let q = createAdminClient().from('audit_logs').select('id, actor_id, action, target_table, target_id, reason, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000);
  if (actorId) q = q.eq('actor_id', actorId);
  const { data, error } = await q;
  if (error) throw new Error(`loadChanges: ${error.code}`);
  return (data ?? []).map((r) => ({ id: r.id as number, actorId: r.actor_id as string | null, action: r.action as string, table: r.target_table as string, targetId: r.target_id as string | null, reason: r.reason as string | null, createdAt: r.created_at as string }));
}

/** 사용자 에이전트 → 짧은 기기 이름 (예: 「Android · Chrome」) */
export function deviceLabel(ua: string | null): string {
  if (!ua) return '—';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : 'etc';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /KAKAOTALK/.test(ua) ? 'KakaoTalk' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'etc';
  if (os === 'etc' && br === 'etc') return '—';
  return [os, br].filter((x) => x !== 'etc').join(' · ');
}
