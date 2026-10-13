// 회사 급여 설정 저장 — 새 판을 쌓는다 (PRD v1.3 17.1 · 17.2 · 17.7 · 17.8). 급여 담당 관리자만.
import { api, ApiError, readJson } from '@/lib/api';
import { requirePayroll, saveSetting } from '@/lib/payroll/data';
import { cleanText, DEFAULT_LEDGER, isDate, SETTING_SECTIONS, validateSetting, type SettingSection } from '@/lib/payroll/settings';
import { toKstDate } from '@/lib/time';

export const POST = api<{ params: Promise<{ section: string }> }>('admin.payroll.settings', async (req, ctx) => {
  const me = await requirePayroll();
  const { section } = await ctx.params;
  if (!(SETTING_SECTIONS as readonly string[]).includes(section)) throw new ApiError(404, 'not_found');
  const b = await readJson(req);
  // 급여대장을 기본값으로 시작하기 — 아직 저장한 판이 없을 때만 (있으면 409)
  if (b.action === 'seed') {
    if (section !== 'ledger') throw new ApiError(400, 'invalid_input');
    const row = await saveSetting({ section: 'ledger', payload: DEFAULT_LEDGER, validFrom: toKstDate(new Date()).slice(0, 4) + '-01-01', reason: null, expectedVersion: 0, me });
    return { version: row.version, validFrom: row.validFrom };
  }
  const v = validateSetting(section as SettingSection, b);
  const reason = cleanText(b.reason, 500);
  if (!v.ok || !isDate(b.validFrom) || reason === undefined || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
  const row = await saveSetting({ section: section as SettingSection, payload: v.value, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion as number, me });
  return { version: row.version, validFrom: row.validFrom };
});
