// 연차 기준을 2027-01-01부터 입사일 기준으로 (2026-10-21 의뢰인, 결정 사항 휴가-15). 한 번만 돌린다.
//   기본 그룹의 지금 판(회계연도)을 2027-01-01에 닫고, 판 4 = 입사일 기준 + convertedOn 2027-01-01 (그날 남은 기간 비례 전환 연차).
//   돌리기 전 판 전체를 백업/연차정책-<시각>.json에 남긴다. lib/leave-ledger-data.ts saveLeavePolicy와 같은 순서.
//   npx tsx scripts/leave-policy-hire-1021.mts
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateLeavePolicy } from '../src/lib/leave-ledger.ts';
config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FROM = '2027-01-01';
const { data: g } = await db.from('leave_policy_groups').select('id, name').eq('is_default', true).eq('active', true).single();
const { data: all } = await db.from('leave_policy_versions').select('*');
const out = path.join(import.meta.dirname, '..', '..', '..', '백업', `연차정책-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify(all, null, 2));
console.log('백업:', out);
const rows = (all ?? []).filter((r) => r.group_id === g!.id && r.status === 'active').sort((a, b) => b.version - a.version);
const last = rows[0];
if (validateLeavePolicy(last.payload)?.basis === 'hire_date') { console.log('이미 입사일 기준 — 하지 않음'); process.exit(0); }
const policy = validateLeavePolicy({ ...last.payload, basis: 'hire_date', convertedOn: FROM });
if (!policy || FROM <= last.valid_from) throw new Error('bad policy');
const { data: sys } = await db.from('profiles').select('id').eq('employee_no', process.env.OWNER_EMPLOYEE_NO ?? 'admin').maybeSingle();
const by = sys?.id ?? last.created_by;
const e1 = await db.from('leave_policy_versions').update({ valid_to: FROM }).eq('id', last.id);
if (e1.error) throw e1.error;
const e2 = await db.from('leave_policy_versions').insert({ group_id: g!.id, payload: policy, valid_from: FROM, version: last.version + 1, reason: '2026-10-21 의뢰인: 시정조치에 따라 입사일 기준으로. 2027-01-01에 다음 입사 기념일까지 남은 기간 비례분(전환 연차) — 결정 사항 휴가-15', supersedes_id: last.id, created_by: by });
if (e2.error) { await db.from('leave_policy_versions').update({ valid_to: last.valid_to }).eq('id', last.id); throw e2.error; }
console.log(`판 ${last.version} → ${FROM}에 닫음, 판 ${last.version + 1} 입사일 기준 넣음`);
