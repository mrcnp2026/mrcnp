// 회사 정보 (2026-10-18 의뢰인: 회사 기본설정은 휴일보다 회사 정보가 먼저) — DB 묶음 24의 company_profile_versions.
// 고칠 때마다 한 줄을 더하고 가장 최근 줄을 쓴다(이력). 표가 비어 있으면 지금까지의 고정 값(config/brand)을 쓴다. 서버 전용.
import 'server-only';
import { cache } from '@/lib/request-cache'; // API에서도 한 요청 한 번 (2026-11-05)
import { BRAND } from '@/config/brand';
import { createAdminClient } from '@/lib/supabase/admin';

export type CompanyProfile = {
  name: string; ceo: string; bizNo: string; address: string; phone: string; policy: string; privacyOfficer?: string; logoPath: string | null; logoMime: string | null; logoAt: string | null;
  iconPath?: string | null; iconAt?: string | null; // 앱 아이콘(2026-11-03): 사진 저장소의 brand/icon-…/ 폴더 — 그 안에 s64 · s180 · s192 · s512 · mask512.png
  switches?: Record<string, boolean>; // 통합설정 스위치 (2026-10-19, lib/switches.ts) — 회사 정보와 같은 이력 줄에 함께 남긴다(DB 변경 없음)
  pushAlways?: string | null; // 관리자 폰 알림을 「항상」 받는 최고관리자 id (2026-10-29 9-2). 없으면(undefined) 예전처럼 OFFICE.pushAlwaysEmployeeNo, null이면 아무도 없음
  pushAdmins?: Record<string, boolean>;
  logViewers?: string[]; // 접속 · 변경 기록을 볼 수 있는 최고관리자 id (2026-10-30, lib/log-access.ts). 시스템관리자는 늘 본다
  accessReviews?: { at: string; by: string }[]; // 접속 기록 점검 (2026-10-29 9-5, 개인정보 안전성 기준 — 월 1회 이상). 최근 24번만 남긴다 // 관리자 폰 알림 받는 최고관리자 (직원 id → 켬, 2026-10-21, lib/push-recipients.ts) — 같은 이력 줄(DB 변경 없음)
};
const EMPTY: CompanyProfile = { name: '', ceo: '', bizNo: '', address: '', phone: '', policy: '', logoPath: null, logoMime: null, logoAt: null };

/** 지금 회사 정보 — 한 요청에 한 번만 읽는다. 표가 아직 없거나 비어 있으면 빈 값 */
export const companyProfile = cache(async (): Promise<CompanyProfile> => {
  const { data, error } = await createAdminClient().from('company_profile_versions').select('value').order('created_at', { ascending: false }).limit(1);
  if (error) return EMPTY;
  return { ...EMPTY, ...((data?.[0]?.value as Partial<CompanyProfile> | undefined) ?? {}) };
});

/** 문서 · 명세서 · 화면 제목에 쓰는 회사 이름 — 비어 있거나 영문 약칭(MRCNP)이면 법인 이름 「(주)엠알씨앤피」, 「(주) 」 뒤 띄어쓰기는 붙인다 (2026-10-30 의뢰인) */
export async function companyName(): Promise<string> {
  const v = (await companyProfile()).name.trim().replace(/^\(\s*주\s*\)\s*/, '(주)');
  return !v || /^mrcnp$/i.test(v) ? BRAND.legalName : v;
}

export async function putCompanyProfile(patch: Partial<CompanyProfile>, actorId: string): Promise<CompanyProfile> {
  const next: CompanyProfile = { ...(await companyProfile()), ...patch };
  const { error } = await createAdminClient().from('company_profile_versions').insert({ value: next, created_by: actorId });
  if (error) throw new Error(`company.put: ${error.code}`);
  return next;
}

const LIMIT = { name: 60, ceo: 40, bizNo: 20, address: 200, phone: 30, policy: 2000, privacyOfficer: 80 } as const; // privacyOfficer: 개인정보 보호책임자 (2026-10-29 — 처리방침 8장)
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
