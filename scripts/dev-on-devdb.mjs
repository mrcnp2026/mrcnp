// 개발용 DB(출퇴근관리-개발)로 앱을 띄운다 — `npm run dev:devdb` (주소는 그대로 http://localhost:4123)
// .env.local은 운영 DB를 가리킨다. 여기서는 .env.dev의 DEV_* 값을 앱이 읽는 이름으로 바꿔 넣고 띄운다(이미 들어 있는 환경 값은 .env.local이 덮지 못한다).
// 안전장치: 개발 주소가 운영 주소와 같으면 멈춘다. 폰 알림은 꺼서, 개발 DB에 복사된 직원 폰으로 알림이 나가지 않게 한다.
import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const prod = config({ path: path.join(root, '.env.local'), quiet: true, processEnv: {} }).parsed ?? {};
const dev = config({ path: path.join(root, '.env.dev'), quiet: true, processEnv: {} }).parsed ?? {};
const need = ['DEV_SUPABASE_URL', 'DEV_SUPABASE_PUBLISHABLE_KEY', 'DEV_SUPABASE_SERVICE_ROLE_KEY', 'DEV_SUPABASE_DB_URL'];
if (need.some((k) => !dev[k] || /YOUR-PASSWORD/.test(dev[k]))) throw new Error('.env.dev 값이 비어 있습니다');
if (dev.DEV_SUPABASE_URL === prod.NEXT_PUBLIC_SUPABASE_URL) throw new Error('개발 주소가 운영 주소와 같아서 멈춥니다');

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: dev.DEV_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: dev.DEV_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: dev.DEV_SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: dev.DEV_SUPABASE_DB_URL,
  VERCEL_ENV: 'preview', // 「개발 서버입니다」 빨간 띠와 백업 보관 위치(dev/)가 미리보기와 똑같이 동작하게 (2026-10-26 의뢰인)
  VAPID_PRIVATE_KEY: '', // 폰 알림 끔
  GEMINI_API_KEY: '', // 번역 호출 끔
};
console.log(`\n  개발용 DB로 띄웁니다: ${new URL(dev.DEV_SUPABASE_URL).host}\n  주소: http://localhost:4123\n`);
const run = spawn('npx', ['next', 'dev', '-p', '4123'], { cwd: root, env, stdio: 'inherit', shell: true });
run.on('exit', (c) => process.exit(c ?? 0));
