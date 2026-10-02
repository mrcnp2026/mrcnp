// 비상 관리자 초대 (부록 R-2의 4) — 관리자 전원이 앱에 못 들어올 때, 그리고 맨 처음 관리자를 만들 때.
// 개발 PC에서 서버 전용 키(.env.local)로 실행해 **초대 QR 1개만** 발급한다. DB를 손으로 고치지 않는다 — 이것이 유일한 경로다.
//
//   npm run admin:invite -- --no A001 --name "홍길동"
//
// - 사번이 없으면: 관리자로 새로 만든다 (화면 언어 한국어)
// - 사번이 있고 관리자면: 비상 초대를 발급한다. 이 초대로 등록하면 기존 폰 등록은 해제되고 새 폰으로 바뀐다
// - 사번이 있는데 일반 직원이면: 거부한다. 관리자 지정은 두 번째 관리자 확인이 필요한 일이다 (R-2의 8, ②)
// 발급 기록은 invites.issued_via='emergency'로 남고, 관리자 홈(게이트 6)이 "비상 초대가 발급됐습니다"를 띄운다.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import QRCode from 'qrcode';

config({ path: path.join(import.meta.dirname, '..', '.env.local'), quiet: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const employeeNo = arg('no')?.trim() ?? '';
const name = arg('name')?.trim() ?? '';
if (!/^[A-Za-z0-9-]{1,20}$/.test(employeeNo)) {
  console.error('사번을 --no 로 넣으세요 (영문·숫자·- 20자 이내). 예: npm run admin:invite -- --no A001 --name "홍길동"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('열쇠 파일(code/.env.local)에 Supabase 키가 없습니다.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const origin = (process.env.APP_ORIGIN || 'http://localhost:4123').replace(/\/$/, '');
const INVITE_HOURS = 72; // src/config/office.ts inviteValidHours와 같게

const { data: existing, error: e0 } = await db.from('profiles').select('id, name, role, active').eq('employee_no', employeeNo).maybeSingle();
if (e0) throw new Error(e0.message);

let employeeId: string;
let displayName: string;
if (!existing) {
  if (!name) {
    console.error('새 관리자를 만들려면 --name 으로 이름을 넣으세요.');
    process.exit(1);
  }
  const { data: u, error: e1 } = await db.auth.admin.createUser({ email: `${employeeNo.toLowerCase()}@staff.invalid`, email_confirm: true });
  if (e1 || !u.user) throw new Error(`계정 만들기 실패: ${e1?.message}`);
  const { error: e2 } = await db.from('profiles').insert({ id: u.user.id, name, employee_no: employeeNo, role: 'admin', locale: 'ko' });
  if (e2) {
    await db.auth.admin.deleteUser(u.user.id);
    throw new Error(`직원 정보 만들기 실패: ${e2.message}`);
  }
  employeeId = u.user.id;
  displayName = name;
  console.log(`새 관리자를 만들었습니다: ${name} (${employeeNo})`);
} else {
  if (existing.role !== 'admin' || !existing.active) {
    console.error('이 사번은 활성 관리자가 아닙니다. 일반 직원의 초대는 관리자 화면(직원 탭)에서 발급하세요.');
    process.exit(1);
  }
  employeeId = existing.id;
  displayName = existing.name;
}

const now = new Date();
await db.from('invites').update({ revoked_at: now.toISOString() }).eq('employee_id', employeeId).is('used_at', null).is('revoked_at', null);
const token = randomBytes(32).toString('base64url');
const expiresAt = new Date(now.getTime() + INVITE_HOURS * 3_600_000);
const { error: e3 } = await db.from('invites').insert({
  employee_id: employeeId,
  token_hash: createHash('sha256').update(token).digest('hex'),
  issued_via: 'emergency',
  issued_by: null,
  expires_at: expiresAt.toISOString(),
});
if (e3) throw new Error(`초대 발급 실패: ${e3.message}`);

const link = `${origin}/register?token=${token}`;
console.log(`\n비상 초대 — ${displayName} (${employeeNo})`);
console.log(`유효: ${expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 까지 (${INVITE_HOURS}시간)\n`);
console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
console.log(link);
if (origin.includes('localhost')) {
  console.log('\n※ 이 주소는 이 PC에서만 열립니다. 이 PC의 브라우저에서 위 주소를 열어 Windows Hello(PIN·지문)로 등록하세요.');
}
console.log('※ 이 초대로 등록하면 이 사람의 기존 폰 등록은 해제됩니다. 이 기록은 남습니다 (emergency).');
