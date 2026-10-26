// 보관소의 운영 백업 목록과 마지막 백업이 얼마나 오래됐는지 본다 — `npx tsx scripts/backup-check.mts [dev]` (읽기만 한다)
// 운영 백업은 매일 새벽 2시(한국)에 자동으로 생긴다. 어제 밤 이후 새벽 2시 전후(01:55~02:30) 백업이 있으면 자동 백업이 돈 것이다.
import { config } from 'dotenv';
config({ path: '.env.dev', quiet: true });
process.env.BACKUP_STORE_URL = process.env.DEV_SUPABASE_URL;
process.env.BACKUP_STORE_KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
const { listStored } = await import('../src/lib/backup/store.ts');
const prefix = process.argv[2] === 'dev' ? 'dev' : 'prod';
const all = (await listStored(prefix)).sort((a, b) => b.name.localeCompare(a.name));
const nowKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
console.log(`지금(한국) ${nowKst} · ${prefix} 백업 ${all.length}개`);
for (const b of all.slice(0, 8)) {
  const auto = /^0[12]:[0-5]\d$/.test(b.time) && b.time >= '01:55' && b.time <= '02:30';
  console.log(`  ${b.date} ${b.time}  ${(b.size / 1024 / 1024).toFixed(2)}MB${auto ? '  ← 새벽 2시 자동 백업' : ''}`);
}
const last = all[0];
if (!last) console.log('백업이 하나도 없습니다');
else {
  const hours = Math.round((Date.now() - Date.parse(last.createdAt)) / 360000) / 10;
  console.log(`마지막 백업은 ${hours}시간 전`);
}
