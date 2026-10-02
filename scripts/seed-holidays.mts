// 공휴일 넣기 — supabase/seed/holidays-kr.json → holidays 표 (② 휴일 설정 화면이 생기기 전까지의 경로).
//   npm run db:holidays
// 같은 날짜가 이미 있으면 덮어쓰지 않는다 (사람이 바꿔 둔 값을 지우지 않게). 지우는 기능은 없다.
// 날짜가 요일 규칙과 맞는지(대체공휴일은 평일이어야 함) 먼저 검사하고, 어긋나면 하나도 넣지 않는다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });
const file = path.join(import.meta.dirname, '..', 'supabase', 'seed', 'holidays-kr.json');
const { holidays } = JSON.parse(fs.readFileSync(file, 'utf8')) as { holidays: { date: string; label: string }[] };

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=일
const problems: string[] = [];
const seen = new Set<string>();
for (const h of holidays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date) || Number.isNaN(Date.parse(h.date))) problems.push(`날짜 형식: ${h.date}`);
  if (seen.has(h.date)) problems.push(`중복: ${h.date}`);
  seen.add(h.date);
  if (h.label.startsWith('대체공휴일') && (weekday(h.date) === 0 || weekday(h.date) === 6)) problems.push(`대체공휴일이 주말: ${h.date}`);
}
if (problems.length) {
  console.error('넣지 않았습니다:\n' + problems.join('\n'));
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error, data } = await db
  .from('holidays')
  .upsert(holidays.map((h) => ({ the_date: h.date, label: h.label, kind: 'public' })), { onConflict: 'the_date', ignoreDuplicates: true })
  .select('the_date');
if (error) throw new Error(error.message);
const { count } = await db.from('holidays').select('the_date', { count: 'exact', head: true });
console.log(`새로 넣음 ${data?.length ?? 0}건 · 휴일 표 전체 ${count}건`);
