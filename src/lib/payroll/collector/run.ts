// 공식자료 수집 실행 — 「지금 업데이트」와 정기 실행이 같은 길을 쓴다 (PRD v1.3 6.1 · 31장).
// 수집은 「검토 대기」 후보를 만드는 데까지만 한다. 지금 쓰는 값 · 승인 상태는 건드리지 않는다.
import 'server-only';
import { ApiError } from '@/lib/api';
import type { Me } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stageCandidates } from '../data';
import { collectOne, SOURCES, type SourceResult } from './sources';

/** 앞선 실행이 끝나지 않았으면(5분 안) 새로 시작하지 않는다 — 같은 자료가 두 번 후보로 들어가지 않게 */
const LOCK_MS = 5 * 60 * 1000;

export async function runCollector(actor: Me | null, trigger: 'manual' | 'scheduled'): Promise<{ runId: string; status: string; results: SourceResult[] }> {
  const db = createAdminClient();
  const { data: busy } = await db.from('payroll_refresh_runs').select('id').eq('status', 'running').in('trigger', ['manual', 'scheduled']).gte('started_at', new Date(Date.now() - LOCK_MS).toISOString()).limit(1);
  if (busy?.length) throw new ApiError(409, 'payroll_refresh_running');
  const { data: run, error } = await db.from('payroll_refresh_runs').insert({ trigger, actor_id: actor?.id ?? null, status: 'running' }).select('id').single();
  if (error || !run) throw new Error(`runCollector.start: ${error?.code}`);
  const results: SourceResult[] = [];
  try {
    const done = await Promise.all(SOURCES.map(collectOne));
    // 후보 넣기는 차례대로 (같은 종류의 중복 검사가 서로 엇갈리지 않게)
    for (const d of done) {
      if (d.result.ok && d.candidates.length) {
        try {
          const r = await stageCandidates(d.candidates, 'collected', actor, run.id);
          d.result.staged = r.staged;
          d.result.unchanged = r.unchanged;
        } catch {
          d.result.ok = false;
          d.result.error = 'stage_failed';
        }
      }
      results.push(d.result);
    }
  } finally {
    const failed = results.filter((r) => !r.ok).length;
    const status = results.length === 0 || failed === results.length ? 'failed' : failed ? 'partial' : 'done';
    await db.from('payroll_refresh_runs').update({ status, ended_at: new Date().toISOString(), source_results: results }).eq('id', run.id);
  }
  const failed = results.filter((r) => !r.ok).length;
  return { runId: run.id, status: failed === results.length ? 'failed' : failed ? 'partial' : 'done', results };
}
