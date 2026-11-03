// 서버 전용 모듈을 스크립트에서 읽기 전용으로 부를 때 — 요청 문맥이 필요한 것만 바꿔 끼운다 (근태 점검 모의 실행 등).
//   @/lib/auth getMe → 최고관리자처럼(검사 계정 제외 규칙이 실제 관리자와 같게) · @/lib/scope 보는 범위 → 전체 · next/server after → 아무것도 안 함
import { registerHooks } from 'node:module';
const stubs = {
  '@/lib/auth': `export async function getMe(){return {id:'00000000-0000-0000-0000-000000000000',role:'admin',name:'script',employeeNo:'script'};} export const requireMe=getMe;`,
  '@/lib/scope': `const all=async()=>null; export const viewerScope=all; export const stagedEmployees=async()=>new Set(); export const within=(rows,s,idOf)=>s?rows.filter(r=>s.has(idOf(r))):rows; export async function scopeFilter(){return()=>true;}`,
  'next/server': `export const after=()=>{}; export class NextResponse{};`,
  'server-only': ``,
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec in stubs) return { url: 'stub:' + spec, shortCircuit: true, format: 'module' };
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: stubs[url.slice(5)], shortCircuit: true };
    return next(url, ctx);
  },
});
