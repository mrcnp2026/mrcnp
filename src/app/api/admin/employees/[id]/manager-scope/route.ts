// 지점관리자가 맡는 지점 지정 (의뢰인 2026-10-13, 결정 사항 개발-19). 관리자만.
// 보낸 목록이 곧 맡는 지점 전부다 — 빠진 지점은 끄고(지우지 않는다) 새 지점은 넣는다. 누가 바꿨는지는 변경 기록에 남는다.
// 부서를 맡기면 그 밑의 팀도 포함된다(펼치는 것은 읽을 때 한다 — manager-rules.ts).
import { api, ApiError, readJson } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { saveManagerScope } from '@/lib/manager-scope-save';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = api<{ params: Promise<{ id: string }> }>('admin.employees.managerScope', async (req, ctx) => {
  const me = await requireAdmin();
  if (!me) throw new ApiError(403, 'forbidden');
  const { id } = await ctx.params;
  const b = await readJson(req);
  if (!UUID.test(id) || !Array.isArray(b.groupIds) || b.groupIds.length > 200 || !b.groupIds.every((x) => typeof x === 'string' && UUID.test(x))) throw new ApiError(400, 'invalid_input');
  const want = await saveManagerScope(id, b.groupIds as string[], me.id);
  return { ok: true, groupIds: want };
});
