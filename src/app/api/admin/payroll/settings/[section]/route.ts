// 회사 급여 설정 저장 — 새 판을 쌓는다 (PRD v1.3 17.1 · 17.2 · 17.7 · 17.8). 급여 담당 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll, saveSetting } from '@/lib/payroll/data';
import { cleanText, isDate, SETTING_SECTIONS, validateSetting, type SettingSection } from '@/lib/payroll/settings';

export const POST = api<{ params: Promise<{ section: string }> }>('admin.payroll.settings', async (req, ctx) => {
  const me = await requirePayroll();
  const { section } = await ctx.params;
  if (!(SETTING_SECTIONS as readonly string[]).includes(section)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  const v = validateSetting(section as SettingSection, b);
  const reason = cleanText(b.reason, 500);
  if (!v.ok || !isDate(b.validFrom) || reason === undefined || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
  const row = await saveSetting({ section: section as SettingSection, payload: v.value, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion as number, me });
  return { version: row.version, validFrom: row.validFrom };
});
