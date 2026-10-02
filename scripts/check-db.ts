// 열쇠 파일(code/.env.local)이 제대로 들어갔는지 확인한다 — `npm run check:db`
// 비밀 키 값은 화면에 찍지 않는다. 결과만 한 줄씩 보여 준다.
import { config } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

let ok = true;
function line(pass: boolean, text: string) {
  if (!pass) ok = false;
  console.log(`${pass ? '✓' : '✗'} ${text}`);
}

async function main() {
  line(!!url, '프로젝트 주소(NEXT_PUBLIC_SUPABASE_URL)');
  line(!!publishable, '공개 키(NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)');
  line(!!secret, '서버 전용 키(SUPABASE_SERVICE_ROLE_KEY)');
  line(!!process.env.SUPABASE_DB_URL, '데이터베이스 연결 주소(SUPABASE_DB_URL) — 자동 검사용');
  if (!url || !publishable || !secret) {
    console.log('\n열쇠 파일에 빈 칸이 있습니다. .env.sample 설명을 보고 채워 주세요.');
    process.exit(1);
  }

  // 서버 전용 키: 표를 읽을 수 있어야 한다
  const server = createClient(url, secret, { auth: { persistSession: false } });
  const s = await server.from('work_rules').select('id', { count: 'exact', head: true });
  line(!s.error, `서버 키로 데이터베이스 연결${s.error ? ` — 실패 (${s.error.code ?? ''})` : ''}`);

  // 공개 키(로그인 안 함): 직원 정보를 못 읽어야 한다 — 권한 잠금
  const anon = createClient(url, publishable, { auth: { persistSession: false } });
  const a = await anon.from('profiles').select('id').limit(1);
  const blocked = !!a.error || (a.data?.length ?? 0) === 0;
  line(blocked, '로그인 안 한 사람은 직원 정보를 못 읽음 (권한 잠금)');

  // 공개 키로 기록 쓰기 시도 → 거부돼야 한다
  const w = await anon.from('punch_events').insert({
    employee_id: '00000000-0000-0000-0000-000000000000', kind: 'in', work_date: '2026-10-02',
  });
  line(!!w.error, '로그인 안 한 사람은 출퇴근 기록을 못 씀 (권한 잠금)');

  console.log(ok ? '\n모두 정상입니다.' : '\n✗ 표시된 줄을 확인해 주세요.');
  process.exit(ok ? 0 : 1);
}

main().catch(() => {
  console.log('✗ 연결 중 오류가 났습니다. 프로젝트 주소와 키를 다시 복사해 넣어 주세요.');
  process.exit(1);
});
