// 근태 점검 2단계 — 한 달을 판정해 사람별 · 유형별 건수와 예시를 보고한다. 읽기 전용(DB에 쓰지 않는다).
//   node --import ./scripts/lib/server-stub-hooks.mjs --import tsx scripts/attendance-check-preview.mts 2026-10
import { CHECK_KINDS, countDays } from '@/lib/attendance-check';
import { collectChecks, loadEarlyIgnoreAt } from '@/lib/attendance-check-data';
import { loadPeriod } from '@/lib/period-data';
import { monthRange } from '@/lib/month-data';

const month = process.argv[2] ?? '2026-10';
const { from, to } = monthRange(month);
const data = await loadPeriod(from, to, false);
const name = new Map(data.people.map((p) => [p.id, p.name]));
const checks = collectChecks(data, from, to, new Date(), await loadEarlyIgnoreAt());
const kindTotal = new Map<string, { days: number; minutes: number }>();
console.log(`# ${month} 근태 점검 모의 실행 — 사람 ${checks.length}명`);
console.log('이름 | 막음 | 판단 | 확인만 | 한 달 1건 | 합계 | 대표 사유');
for (const c of checks.sort((a, b) => countDays(b.days, new Set(), b.monthly).open - countDays(a.days, new Set(), a.monthly).open)) {
  const n = countDays(c.days, new Set(), c.monthly);
  console.log(`${name.get(c.employeeId)} | ${n.block} | ${n.decide} | ${n.confirm} | ${c.monthly.map((m) => `${m.kind} ${m.dates.length}일 ${m.fromMin}~${m.toMin}분${m.patternDays ? ` (${m.patternDays}/${m.workedDays}일)` : ''}`).join(', ') || '-'} | ${n.open} | ${n.top ?? '-'}`);
  for (const d of c.days) for (const p of d.parts) { const k = `${p.kind}:${p.quiet ? 'quiet' : p.bundled ? 'bundled' : p.state}`; const t = kindTotal.get(k) ?? { days: 0, minutes: 0 }; t.days++; t.minutes += p.minutes; kindTotal.set(k, t); }
}
console.log('\n유형:상태 | 날 수 | 분 합계');
for (const k of [...kindTotal.keys()].sort((a, b) => CHECK_KINDS.indexOf(a.split(':')[0] as never) - CHECK_KINDS.indexOf(b.split(':')[0] as never))) console.log(`${k} | ${kindTotal.get(k)!.days} | ${kindTotal.get(k)!.minutes}`);
const want = (process.argv[3] ?? '').split(',').filter(Boolean);
for (const c of checks) {
  if (want.length && !want.includes(name.get(c.employeeId) ?? '')) continue;
  if (!want.length) continue;
  console.log(`\n## ${name.get(c.employeeId)}`);
  for (const d of c.days) console.log(d.workDate, d.state, d.parts.map((p) => `${p.kind} ${p.minutes}분${p.covered ? `(덮임 ${p.covered})` : ''} ${p.state}${p.plan ? ` 일정 ${p.plan} 찍힘 ${p.punched} 계산 ${p.counted}` : ''}`).join(' / '));
}
