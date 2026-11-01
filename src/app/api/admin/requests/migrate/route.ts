// 이관 정리 실행 (개발-63) — 기준일 이전 지난 연장 요청을 고른 대로 한 번에 결정한다. 최고관리자만.
// 결정 기록에 「지난 요청 정리」 사유가 남고, 직원 폰 알림은 보내지 않는다(평소 결정 API와 다른 점). 규칙은 migrate-close-rules.ts.
import { getTranslations } from 'next-intl/server';
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { OFFICE } from '@/config/office';
import { runMigrate } from '@/lib/migrate-close';
import type { MigrateAction } from '@/lib/migrate-close-rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: readonly MigrateAction[] = ['keep', 'approve', 'reject'];

export const POST = api('admin.requests.migrate', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const b = await readJson(req);
  if (!Array.isArray(b.picks) || b.picks.length === 0 || b.picks.length > 1000) throw new ApiError(400, 'invalid_input');
  const picks = (b.picks as unknown[]).map((p) => p as { id?: unknown; action?: unknown });
  if (picks.some((p) => typeof p.id !== 'string' || !UUID.test(p.id) || !ACTIONS.includes(p.action as MigrateAction))) throw new ApiError(400, 'invalid_input');
  const t = await getTranslations('migrate');
  return runMigrate({
    picks: picks as { id: string; action: MigrateAction }[],
    actorId: me.id,
    requestId: ctx.requestId,
    reason: t('reason', { date: OFFICE.migrationCutoff }),
    practice: OFFICE.practiceMode && b.live !== true, // 요청함과 같이 — 연습 모드에서 실제 기록을 다룰 때만 live
  });
});
