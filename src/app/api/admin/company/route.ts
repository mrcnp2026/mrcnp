// 회사 정보 저장 (통합설정 › 회사 기본설정, 2026-10-18 의뢰인) — 회사명 · 대표자 · 사업자등록번호 · 주소 · 대표 전화 · 근태 방침.
// 숫자 4자리로 연 최고관리자만. 고칠 때마다 이력 한 줄(lib/company.ts, DB 묶음 24).
import { api, ApiError, readJson } from '@/lib/api';
import { cleanProfileText, putCompanyProfile } from '@/lib/company';
import { requireConsole } from '@/lib/console-pin';

export const POST = api('admin.company', async (req) => {
  const me = await requireConsole();
  const patch = cleanProfileText(await readJson(req));
  if (Object.keys(patch).length === 0) throw new ApiError(400, 'invalid_input');
  if (patch.name !== undefined && patch.name.length === 0) throw new ApiError(400, 'company_name_required');
  await putCompanyProfile(patch, me.id);
  return { ok: true };
});
