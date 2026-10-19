// 2026-10-18 의뢰인 휴가-14: 시간 단위 휴가 종류 정리 — 외출/조퇴 1·2·3·5·6·7시간, 반차 4시간, 연차 8시간.
//   npx tsx scripts/leave-types-1018.mts          ← 지금 종류와 신청 건수만 보여 준다(바꾸지 않음)
//   npx tsx scripts/leave-types-1018.mts --apply  ← 없는 것만 만든다
import { config } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: types, error } = await db.from('leave_types').select('code, name, hours, day_unit, is_paid, deducts_balance, start_time, end_time, group_name, builtin, active, sort').order('sort').order('name');
if (error) throw error;
const { data: reqs } = await db.from('leave_requests').select('type_code');
const used = new Map<string, number>();
for (const r of reqs ?? []) used.set(r.type_code, (used.get(r.type_code) ?? 0) + 1);
for (const t of types ?? []) console.log([t.active ? '켜짐' : '꺼짐', t.code, t.name, `${t.hours}h`, `일수 ${t.day_unit}`, t.is_paid ? '유급' : '무급', t.deducts_balance ? '차감' : '비차감', t.start_time ? `${t.start_time}-${t.end_time}` : '시각없음', t.group_name ?? '-', `신청 ${used.get(t.code) ?? 0}건`].join(' | '));

// 의뢰인(2026-10-18): 새로 만들지 말고 기존 종류를 고친다. 시간은 이미 맞으니 이름만 바꾸고, 1→8시간 순서로 정렬한다.
const PLAN: { code: string; name?: string; sort: number }[] = [
  { code: 'c_da374b5511', sort: 10 }, // 조퇴 0.5H (그대로)
  { code: 'c_43ea3f6ac2', sort: 11 }, // 외출/조퇴 1H
  { code: 'c_c07dfc2fc7', sort: 12 }, // 외출/조퇴 2H
  { code: 'c_3cfd6b32e3', sort: 13 }, // 외출/조퇴 3H
  { code: 'c_8853a26747', sort: 14 }, // 반차4H
  { code: 'c_d5fc4c671a', name: '외출/조퇴 5H', sort: 15 }, // 11시 조퇴 (5h)
  { code: 'c_6322891cfe', name: '외출/조퇴 6H', sort: 16 }, // 10시 조퇴 (6h)
  { code: 'c_3e099d92b4', name: '외출/조퇴 7H', sort: 17 }, // 09시 조퇴 (7h)
  { code: 'c_893ca3d764', sort: 18 }, // 연차8H
];
if (process.argv.includes('--apply')) {
  const fs = await import('node:fs');
  const before = (types ?? []).filter((t) => PLAN.some((p) => p.code === t.code));
  const file = path.join(import.meta.dirname, '..', '..', '..', '백업', `휴가종류-정리-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(before, null, 2));
  console.log('백업:', path.basename(file));
  for (const p of PLAN) {
    const { error: e } = await db.from('leave_types').update({ sort: p.sort, ...(p.name ? { name: p.name } : {}) }).eq('code', p.code);
    if (e) throw e;
  }
  console.log('적용 완료');
}
