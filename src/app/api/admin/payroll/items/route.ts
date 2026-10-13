// 지급 · 공제 항목 — 등록/고침(새 판) · 사용 여부 · 통상 항목 한꺼번에 넣기 (PRD v1.3 17.3). 급여 담당 관리자만. 지우는 기능은 없다.
import { api, ApiError, readJson } from '@/lib/api';
import { loadItems, requirePayroll, saveItem, setItemUse } from '@/lib/payroll/data';
import { cleanText, isDate, STANDARD_ITEMS, validateItem } from '@/lib/payroll/settings';
import { toKstDate } from '@/lib/time';

export const POST = api('admin.payroll.items', async (req) => {
  const me = await requirePayroll();
  const b = await readJson(req);
  if (b.action === 'use') {
    if (typeof b.id !== 'string' || typeof b.inUse !== 'boolean') throw new ApiError(400, 'invalid_input');
    await setItemUse(b.id, b.inUse);
    return { ok: true };
  }
  if (b.action === 'seed') {
    // 통상 쓰는 항목을 「임시」로 넣는다. 이미 있는 코드는 건드리지 않는다
    const have = new Set((await loadItems()).map((x) => x.code));
    const from = toKstDate(new Date()).slice(0, 4) + '-01-01';
    let added = 0;
    for (const input of STANDARD_ITEMS.filter((x) => !have.has(x.code))) {
      await saveItem({ input, validFrom: from, reason: null, expectedVersion: 0, me });
      added++;
    }
    return { added };
  }
  const v = validateItem(b);
  const reason = cleanText(b.reason, 500);
  if (!v.ok || !isDate(b.validFrom) || reason === undefined || !Number.isInteger(b.expectedVersion)) throw new ApiError(400, 'invalid_input');
  const row = await saveItem({ input: v.value, validFrom: b.validFrom, reason, expectedVersion: b.expectedVersion as number, me });
  return { code: row.code, version: row.version };
});
