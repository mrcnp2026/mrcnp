// 요청 목록에서 「지우기」 (2026-10-19 의뢰인) — 요청 기록은 그대로 두고 그 사람의 목록에서만 뺀다. 서버 전용.
// 표(request_hides, 묶음 25)가 아직 없으면 ready=false — 화면은 지우기 단추를 보이지 않는다.
import 'server-only';
import { readAll } from '@/lib/read-all';
import { createAdminClient } from '@/lib/supabase/admin';

const MISSING = new Set(['42P01', 'PGRST205']);

export async function loadHidden(viewerId: string): Promise<{ ready: boolean; keys: Set<string> }> {
  const db = createAdminClient();
  const probe = await db.from('request_hides').select('item_key').eq('viewer_id', viewerId).limit(1);
  if (probe.error) return { ready: !MISSING.has(probe.error.code ?? ''), keys: new Set() };
  const { data } = await readAll((a, b) => db.from('request_hides').select('item_key').eq('viewer_id', viewerId).order('item_key').range(a, b));
  return { ready: true, keys: new Set((data ?? []).map((r) => r.item_key as string)) };
}

/** 지운 것 · 대기 중인 것을 가른다 — 대기 중인 요청은 지우지 않는다(처리해야 하므로) */
export function withoutHidden<T extends { key: string; status: string }>(items: T[], hidden: Set<string>): T[] {
  return hidden.size ? items.filter((r) => r.status === 'pending' || !hidden.has(r.key)) : items;
}
