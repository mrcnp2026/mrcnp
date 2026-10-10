// 직무 읽기. 서버 전용.
import 'server-only';
import { cache } from 'react';
import { sortJobs, type Job } from '@/lib/jobs';
import { createAdminClient } from '@/lib/supabase/admin';

/** 직무 전부 (꺼 둔 것 포함) — 꺼 둔 직무도 이미 지정된 직원의 표시에는 쓴다 */
export const loadJobs = cache(async (): Promise<Job[]> => {
  const { data, error } = await createAdminClient().from('jobs').select('id, name, color, sort, active');
  if (error) throw new Error(`loadJobs: ${error.code}`);
  return sortJobs((data ?? []).map((j) => ({ id: j.id, name: j.name, color: j.color, sort: j.sort, active: j.active })));
});
