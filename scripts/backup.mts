// 주간 백업 (GitHub Actions .github/workflows/backup.yml이 매주 일요일 새벽 3시에 돌린다)
// 1) pg_dump로 로그인 정보(auth.users · auth.identities 자료)와 앱 자료(public 전체)를 한 파일로 받는다
// 2) 압축 → 암호화 → 암호를 다시 풀어 원본과 같은지 확인
// 3) 비공개 저장소 릴리스에 올리고, 보관 규칙(src/lib/backup/retention.ts)에서 벗어난 오래된 백업을 지운다
// 4) 최고관리자(이상준)에게 메일 — 성공은 이번 주 요약, 실패는 어디서 멈췄는지
// 필요한 값: SUPABASE_DB_URL, BACKUP_PASSWORD, BACKUP_REPO, BACKUP_GITHUB_TOKEN, BACKUP_ALERT_EMAIL, SMTP_USER, SMTP_PASS
// 내 PC에서 시험: npx tsx scripts/backup.mts --dry (올리기 · 지우기 · 메일 없이 파일만 만든다)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, mkdirSync, openSync, readSync, rmSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { config } from 'dotenv';
import pg from 'pg';
import { encryptFile, decryptFile } from '../src/lib/backup/crypto.ts';
import { classify, toDelete, KEEP_WEEKLY, KEEP_MONTHLY } from '../src/lib/backup/retention.ts';
import { listBackups, uploadBackup, deleteBackup } from '../src/lib/backup/github.ts';
import { sendBackupMail, mailConfigured, mb, kstDate, kstTime } from '../src/lib/backup/mail.ts';

config({ path: '.env.local', quiet: true });
const DRY = process.argv.includes('--dry');
const PG_DUMP = process.env.PG_DUMP ?? 'pg_dump';

let step = '준비';
const started = new Date();
const date = kstDate(started);
const work = join(tmpdir(), `attendance-backup-${date}-${process.pid}`);

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`설정값 ${name}이(가) 없습니다`);
  return v;
}

// 오류 문장에 DB 주소 · 비밀번호가 섞여 메일로 나가지 않게
function scrub(s: string): string {
  let out = s.replace(/postgres(ql)?:\/\/[^\s]+/g, 'postgres://***');
  for (const k of ['SUPABASE_DB_URL', 'BACKUP_PASSWORD', 'BACKUP_GITHUB_TOKEN', 'SMTP_PASS']) {
    const v = process.env[k];
    if (v && v.length > 4) out = out.split(v).join('***');
  }
  return out.slice(0, 600);
}

function dump(args: string[], file: string): Promise<void> {
  return new Promise((ok, bad) => {
    const p = spawn(PG_DUMP, [...args, '--file', file, '--dbname', need('SUPABASE_DB_URL')], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (b) => (err += String(b)));
    p.on('error', bad);
    p.on('close', (code) => (code === 0 ? ok() : bad(new Error(`pg_dump 종료 코드 ${code}: ${err}`))));
  });
}

// 파일 끝부분만 읽는다 (큰 파일을 통째로 문자열로 읽지 않게)
function tail(file: string): string {
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(512, size));
  try {
    readSync(fd, buf, 0, buf.length, size - buf.length);
  } finally {
    closeSync(fd);
  }
  return buf.toString('utf8');
}

// 자료가 들어 있는 표 개수 (COPY public.… 줄)
async function copyCount(file: string): Promise<number> {
  let n = 0;
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) if (line.startsWith('COPY public.')) n++;
  return n;
}

function sha256(file: string): Promise<string> {
  return new Promise((ok, bad) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (b) => h.update(b)).on('end', () => ok(h.digest('hex'))).on('error', bad);
  });
}

async function counts(): Promise<string[]> {
  const c = new pg.Client({ connectionString: need('SUPABASE_DB_URL'), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const one = async (sql: string) => Number((await c.query(sql)).rows[0].n);
    const size = Number((await c.query('select pg_database_size(current_database()) as n')).rows[0].n);
    return [
      `  · 데이터베이스 크기: ${mb(size)} (Supabase Pro 한도 8GB)`,
      `  · 직원 계정: ${await one("select count(*) n from profiles where active")}명`,
      `  · 출퇴근 기록: ${await one('select count(*) n from punch_events')}건`,
      `  · 급여명세서(계산 · 올린 것): ${await one('select (select count(*) from payroll_statements) + (select count(*) from payroll_uploaded_slips) n')}장`,
      `  · 휴가 신청: ${await one('select count(*) n from leave_requests')}건`,
    ];
  } finally {
    await c.end();
  }
}

async function main() {
  mkdirSync(work, { recursive: true });
  const authSql = join(work, '1-auth.sql');
  const appSql = join(work, '2-public.sql');
  const gz = join(work, `attendance-backup-${date}.sql.gz`);
  const enc = `${gz}.enc`;

  step = '데이터베이스 내려받기';
  // 되살릴 때는 이 순서대로: 로그인 정보 자료 → 앱 표 · 자료 (앱 표가 auth.users를 가리키므로)
  await dump(['--data-only', '--table=auth.users', '--table=auth.identities', '--no-owner'], authSql);
  await dump(['--schema=public', '--no-owner'], appSql);
  for (const f of [authSql, appSql]) {
    if (!tail(f).includes('PostgreSQL database dump complete')) throw new Error(`${basename(f)} 파일이 끝까지 받아지지 않았습니다`);
  }
  const tables = await copyCount(appSql);

  step = '압축';
  const out = createWriteStream(join(work, 'all.sql'));
  for (const f of [authSql, appSql]) await pipeline(createReadStream(f), out, { end: false });
  await new Promise<void>((ok) => out.end(ok));
  await pipeline(createReadStream(join(work, 'all.sql')), createGzip({ level: 9 }), createWriteStream(gz));

  step = '암호화';
  const password = need('BACKUP_PASSWORD');
  await encryptFile(gz, enc, password);

  step = '암호 풀기 확인';
  const back = join(work, 'check.sql.gz');
  await decryptFile(enc, back, password);
  if ((await sha256(back)) !== (await sha256(gz))) throw new Error('암호를 풀어 본 파일이 원본과 다릅니다');
  const size = statSync(enc).size;

  step = '자료 개수 세기';
  const summary = await counts();

  if (DRY) {
    console.log(`[시험] 백업 파일 만들기 · 암호 풀기 확인 통과 — ${mb(size)}, 표 ${tables}개 (시험 파일은 지움)`);
    console.log(summary.join('\n'));
    return;
  }

  step = '보관소에 올리기';
  await uploadBackup(date, enc, `attendance-backup-${date}.sql.gz.enc`,
    `근태관리 주간 백업 (${kstTime(started)} 한국 시간)\n표 ${tables}개 · ${mb(size)}\n암호화됨 — 여는 방법: scripts/backup-open.mts`);

  step = '오래된 백업 정리';
  const before = await listBackups();
  const gone = toDelete(before.map((r) => r.date));
  for (const r of before.filter((r) => gone.includes(r.date))) await deleteBackup(r);
  const kept = before.filter((r) => !gone.includes(r.date));
  const cls = classify(kept.map((r) => r.date));
  const n = (k: 'weekly' | 'monthly' | 'yearly') => [...cls.values()].filter((v) => v[k]).length;
  const total = kept.reduce((s, r) => s + r.size, 0);

  step = '메일 보내기';
  const secs = Math.round((Date.now() - started.getTime()) / 1000);
  await sendBackupMail(`주간 백업 정상 (${date})`, [
    '이번 주 백업이 정상으로 끝났습니다.',
    '',
    `■ 이번 백업`,
    `  · 시각: ${kstTime(started)} (한국 시간), ${secs}초 걸림`,
    `  · 파일 크기: ${mb(size)} (압축 · 암호화 후), 표 ${tables}개`,
    `  · 확인: 암호를 다시 풀어 원본과 같은지 확인함`,
    '',
    `■ 들어 있는 자료`,
    ...summary,
    '',
    `■ 보관 중인 백업: ${kept.length}개, 합계 ${mb(total)}`,
    `  · 매주 ${n('weekly')}개 (최근 ${KEEP_WEEKLY}주) · 매월 ${n('monthly')}개 (최근 ${KEEP_MONTHLY}개월) · 매년 ${n('yearly')}개 (영구)`,
    `  · 이번에 정리한 오래된 백업: ${gone.length}개`,
    `  · 최근 7일은 Supabase가 따로 매일 백업합니다`,
    '',
    '다음 백업: 다음 주 일요일 새벽 3시',
  ]);
  console.log(`백업 완료 ${date} ${mb(size)}, 보관 ${kept.length}개, 정리 ${gone.length}개`);
}

try {
  await main();
} catch (e) {
  const msg = scrub(String((e as Error)?.message ?? e));
  console.error(`백업 실패 — 단계: ${step}\n${msg}`);
  if (!DRY && mailConfigured()) {
    await sendBackupMail(`⚠ 백업 실패 (${date})`, [
      '이번 주 백업이 실패했습니다. 지금 서비스는 그대로 돌아가고 있고, 최근 7일치는 Supabase 자체 백업에 있습니다.',
      '',
      `  · 시각: ${kstTime(started)} (한국 시간)`,
      `  · 멈춘 단계: ${step}`,
      `  · 오류: ${msg}`,
      '',
      '할 일: 개발 담당에게 이 메일을 전달해 주세요. GitHub 저장소의 Actions 화면에서 「주간 백업」을 다시 실행할 수 있습니다.',
    ]).catch((m) => console.error('실패 메일도 보내지 못했습니다:', scrub(String(m?.message ?? m))));
  }
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
