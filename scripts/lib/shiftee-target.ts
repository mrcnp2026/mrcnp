// 시프티 가져오기 도구(import-shiftee-*, import-followup) 공통: 어느 DB · 어느 사이트에 넣을지 (2026-11-01 의뢰인: 개발 DB에 먼저 넣어 확인).
//   기본은 운영(.env.local · https://mrcnp-saas.vercel.app). --dev 를 붙이면 개발 DB(.env.dev의 DEV_* 값) · 개발 서버(http://localhost:4123, npm run dev:devdb로 켜 둔다).
//   개발 주소가 운영 주소와 같으면 멈춘다. 주소 · 키는 화면에 찍지 않는다.
//   관리자 API 로그인: 환경 변수 SITE_ID · SITE_PW, 또는 --state=<브라우저 상태 파일>(개발 DB에서는 scripts/dev-look.mts login 으로 만든 파일 — 검사 관리자 e2e-audit)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'node:path';
import { request, type APIRequestContext } from 'playwright-core';

const root = path.join(import.meta.dirname, '..', '..');
const prod = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
export const isDev = process.argv.includes('--dev');
const dev = isDev ? (config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {}) : {};
if (isDev && (!dev.DEV_SUPABASE_URL || !dev.DEV_SUPABASE_SERVICE_ROLE_KEY)) throw new Error('.env.dev 값이 비어 있습니다');
if (isDev && dev.DEV_SUPABASE_URL === prod.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 주소가 운영 주소와 같아서 멈춥니다');

export const targetLabel = isDev ? '개발 DB' : '운영 DB';
export const db = isDev
  ? createClient(dev.DEV_SUPABASE_URL, dev.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : createClient(prod.NEXT_PUBLIC_SUPABASE_URL, prod.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const BASE = isDev ? (process.env.BASE ?? 'http://localhost:4123') : 'https://mrcnp-saas.vercel.app';

/** 관리자 API에 로그인한 요청 도구 — --state=<파일>이 있으면 그 로그인 상태를, 없으면 SITE_ID · SITE_PW로 로그인한다 */
export async function adminApi(): Promise<APIRequestContext> {
  const state = process.argv.find((a) => a.startsWith('--state='))?.slice(8);
  if (state) return request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE }, storageState: state });
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
  const r = await api.post('/api/auth/login', { data: { id: process.env.SITE_ID ?? '', password: process.env.SITE_PW ?? '' } });
  if (!r.ok()) throw new Error(`관리자 로그인 실패 ${r.status()} — 환경 변수 SITE_ID · SITE_PW(최고관리자) 또는 --state=<파일>을 주세요(비밀번호는 파일에 적지 않는다)`);
  return api;
}
