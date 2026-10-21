// 회사 정보 (2026-10-18 의뢰인: 회사 기본설정은 휴일보다 회사 정보가 먼저) — DB 묶음 24의 company_profile_versions.
// 고칠 때마다 한 줄을 더하고 가장 최근 줄을 쓴다(이력). 표가 비어 있으면 지금까지의 고정 값(config/brand)을 쓴다. 서버 전용.
import 'server-only';
import { cache } from 'react';
import { BRAND } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';

export type CompanyProfile = {
  name: string; ceo: string; bizNo: string; address: string; phone: string; policy: string; logoPath: string | null; logoMime: string | null; logoAt: string | null;
  switches?: Record<string, boolean>; // 통합설정 스위치 (2026-10-19, lib/switches.ts) — 회사 정보와 같은 이력 줄에 함께 남긴다(DB 변경 없음)
  pushAdmins?: Record<string, boolean>; // 관리자 폰 알림 받는 최고관리자 (직원 id → 켬, 2026-10-21, lib/push-recipients.ts) — 같은 이력 줄(DB 변경 없음)
};
const EMPTY: CompanyProfile = { name: '', ceo: '', bizNo: '', address: '', phone: '', policy: '', logoPath: null, logoMime: null, logoAt: null };

/** 지금 회사 정보 — 한 요청에 한 번만 읽는다. 표가 아직 없거나 비어 있으면 빈 값 */
export const companyProfile = cache(async (): Promise<CompanyProfile> => {
  const { data, error } = await createAdminClient().from('company_profile_versions').select('value').order('created_at', { ascending: false }).limit(1);
  if (error) return EMPTY;
  return { ...EMPTY, ...((data?.[0]?.value as Partial<CompanyProfile> | undefined) ?? {}) };
});

/** 문서 · 명세서 · 화면 제목에 쓰는 회사 이름 — 비어 있으면 원래 이름 */
export async function companyName(): Promise<string> {
  return (await companyProfile()).name.trim() || BRAND.name;
}

export async function putCompanyProfile(patch: Partial<CompanyProfile>, actorId: string): Promise<CompanyProfile> {
  const next: CompanyProfile = { ...(await companyProfile()), ...patch };
  const { error } = await createAdminClient().from('company_profile_versions').insert({ value: next, created_by: actorId });
  if (error) throw new Error(`company.put: ${error.code}`);
  return next;
}

const LIMIT = { name: 60, ceo: 40, bizNo: 20, address: 200, phone: 30, policy: 2000 } as const;
/** 화면에서 보낸 글자 칸 검사 — 길이만 자르고, 사업자등록번호 · 전화는 숫자와 -만 */
export function cleanProfileText(raw: Record<string, unknown>): Partial<CompanyProfile> {
  const out: Partial<CompanyProfile> = {};
  for (const k of Object.keys(LIMIT) as (keyof typeof LIMIT)[]) {
    if (typeof raw[k] !== 'string') continue;
    let v = (raw[k] as string).replace(/\r\n/g, '\n').trim().slice(0, LIMIT[k]);
    if (k === 'bizNo' || k === 'phone') v = v.replace(/[^\d-]/g, '');
    out[k] = v;
  }
  return out;
}
