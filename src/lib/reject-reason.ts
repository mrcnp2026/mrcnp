// 거절 사유 (2026-10-21 의뢰인: 거절할 때 사유를 적을 수 있게). 서버 전용.
// 사유는 결정 기록(decision_log.reason)에 남긴다 — 결정 함수가 받는 p_reason, 또는 결정 기록 한 줄. DB 변경 없음.
// 적지 않아도 거절된다(선택). 직원의 요청 목록 · 정정 요청 화면 · 거절 알림에 보인다.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanText } from '@/lib/text';

export const REJECT_REASON_MAX = 200;

/** 요청 본문에서 거절 사유 — 거절이 아니거나 비었으면 null */
export function rejectReasonOf(b: Record<string, unknown>): string | null {
  if (b.decision !== 'rejected') return null;
  const r = cleanText(b.reason).slice(0, REJECT_REASON_MAX);
  return r.length > 0 ? r : null;
}

/** 그 요청들의 거절 사유 (표 + id → 사유). 같은 요청에 여러 줄이면 사유가 있는 마지막 줄 */
export async function loadRejectReasons(items: { table: string; id: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(items.map((x) => x.id))];
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await createAdminClient().from('decision_log').select('subject_table, subject_id, reason, created_at').eq('decision', 'rejected').not('reason', 'is', null).in('subject_id', ids.slice(i, i + 200)).order('created_at');
    if (error) throw new Error(`loadRejectReasons: ${error.code}`);
    for (const r of data ?? []) if (r.reason && r.reason !== 'direct') out.set(`${r.subject_table}:${r.subject_id}`, r.reason as string);
  }
  return out;
}
