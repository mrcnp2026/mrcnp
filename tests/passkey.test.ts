// 게이트 3-1 — 폰 등록(패스키) 검증 (①-2 11-A "폰 등록 — 로컬에서 확인 가능한 부분").
// 가짜 폰(SoftAuthenticator)이 실제 형식의 서명을 만들고, 서버 검증 코드는 운영과 같은 것을 쓴다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPasskeyService, hashToken, PasskeyError, type InviteInfo } from '@/lib/passkey';
import { MemoryPasskeyStore } from './helpers/memory-passkey-store';
import { SoftAuthenticator } from './helpers/soft-authenticator';

const RP = { rpID: 'localhost', rpName: 'Attendance', origin: 'http://localhost:4123', challengeTtlMin: 5 };
const EMP = 'emp-1';

function invite(p: Partial<InviteInfo> = {}): InviteInfo {
  return {
    inviteId: 'inv-1',
    employeeId: EMP,
    employeeNo: 'A001',
    name: 'Nguyen Van A',
    locale: 'en',
    employeeActive: true,
    expiresAt: new Date(Date.now() + 3_600_000),
    usedAt: null,
    revokedAt: null,
    issuedVia: 'admin',
    ...p,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof PasskeyError ? e.code : `unexpected: ${e}`;
  }
}

let store: MemoryPasskeyStore;
let now: Date;
let svc: ReturnType<typeof createPasskeyService>;

async function registerPhone(token = 'tok-1', phone = new SoftAuthenticator(RP.rpID, RP.origin)) {
  const opts = await svc.beginRegistration(token);
  await svc.finishRegistration(token, phone.register(opts.challenge), 'Android');
  return phone;
}

beforeEach(() => {
  store = new MemoryPasskeyStore();
  store.activeEmployees.add(EMP);
  store.invites.set(hashToken('tok-1'), invite());
  now = new Date();
  svc = createPasskeyService(store, RP, () => now);
});

describe('폰 등록', () => {
  it('이메일 없이 사번만으로 등록된다 — 등록 옵션의 사용자 이름이 사번', async () => {
    const opts = await svc.beginRegistration('tok-1');
    expect(opts.user.name).toBe('A001');
    expect(opts.authenticatorSelection?.userVerification).toBe('required');
    expect(opts.authenticatorSelection?.authenticatorAttachment).toBe('platform'); // USB 보안키 제외
    const phone = new SoftAuthenticator(RP.rpID, RP.origin);
    const r = await svc.finishRegistration('tok-1', phone.register(opts.challenge), 'Android');
    expect(r.employeeId).toBe(EMP);
    expect(store.passkeys).toHaveLength(1);
  });

  it('저장되는 것은 공개키·서명 횟수·기기 종류뿐이다 — 생체정보 관련 값이 없다', async () => {
    await registerPhone();
    const keys = Object.keys(store.passkeys[0]).sort();
    expect(keys).toEqual(['credentialId', 'employeeId', 'id', 'publicKey', 'revokedAt', 'signCount', 'transports'].sort());
    const sql = readFileSync(path.join(import.meta.dirname, '..', 'supabase', 'migrations', '20261002000001_core_tables.sql'), 'utf8');
    const table = sql.slice(sql.indexOf('create table public.user_passkeys'), sql.indexOf('create unique index one_active_passkey'));
    expect(table).not.toMatch(/biometric|fingerprint|face|template|지문 데이터/i);
  });

  it('직원당 활성 패스키가 2개가 되지 않는다 — 두 번째 초대는 거부', async () => {
    await registerPhone();
    store.invites.set(hashToken('tok-2'), invite({ inviteId: 'inv-2' }));
    expect(await code(svc.beginRegistration('tok-2'))).toBe('already_registered');
    expect(store.passkeys.filter((p) => !p.revokedAt)).toHaveLength(1);
  });

  it('같은 초대 QR로 두 번 등록할 수 없다', async () => {
    await registerPhone();
    expect(await code(svc.beginRegistration('tok-1'))).toBe('invite_invalid');
  });

  it('만료된 초대·퇴사자 초대는 거부된다', async () => {
    store.invites.set(hashToken('old'), invite({ expiresAt: new Date(now.getTime() - 1) }));
    expect(await code(svc.beginRegistration('old'))).toBe('invite_invalid');
    store.invites.set(hashToken('gone'), invite({ employeeActive: false }));
    expect(await code(svc.beginRegistration('gone'))).toBe('employee_inactive');
  });

  it('화면 잠금 없이(사용자 확인 없이) 만든 등록은 거부되고 그 사유가 따로 나온다', async () => {
    const opts = await svc.beginRegistration('tok-1');
    const phone = new SoftAuthenticator(RP.rpID, RP.origin, { userVerified: false });
    expect(await code(svc.finishRegistration('tok-1', phone.register(opts.challenge)))).toBe('user_verification_missing');
    expect(store.passkeys).toHaveLength(0);
  });

  it('다른 주소(도메인)에서 만든 등록은 거부된다 — 패스키는 주소에 묶인다 (B-13)', async () => {
    const opts = await svc.beginRegistration('tok-1');
    const phone = new SoftAuthenticator(RP.rpID, 'https://evil.example');
    expect(await code(svc.finishRegistration('tok-1', phone.register(opts.challenge)))).toBe('verification_failed');
  });

  it('비상 초대(R-2의 4)는 기존 폰을 해제하고 새 폰으로 바꾼다', async () => {
    const old = await registerPhone();
    store.invites.set(hashToken('sos'), invite({ inviteId: 'inv-sos', issuedVia: 'emergency' }));
    const phone2 = new SoftAuthenticator(RP.rpID, RP.origin);
    await registerPhone('sos', phone2);
    expect(store.passkeys.filter((p) => !p.revokedAt).map((p) => p.credentialId)).toEqual([phone2.id]);
    const opts = await svc.beginAssertion('login');
    expect(await code(svc.verifyAssertion(old.assert(opts.challenge), 'login'))).toBe('passkey_revoked');
  });
});

describe('폰으로 본인 확인', () => {
  it('등록한 폰으로 확인하면 그 직원이 나온다', async () => {
    const phone = await registerPhone();
    const opts = await svc.beginAssertion('punch');
    const r = await svc.verifyAssertion(phone.assert(opts.challenge), 'punch');
    expect(r.employeeId).toBe(EMP);
  });

  it('같은 챌린지를 두 번 쓰면 거부된다 (1회용)', async () => {
    const phone = await registerPhone();
    const opts = await svc.beginAssertion('punch');
    const res = phone.assert(opts.challenge);
    expect(await code(svc.verifyAssertion(res, 'punch'))).toBe('ok');
    expect(await code(svc.verifyAssertion(res, 'punch'))).toBe('challenge_invalid');
  });

  it('5분이 지난 챌린지는 거부된다', async () => {
    const phone = await registerPhone();
    const opts = await svc.beginAssertion('punch');
    now = new Date(now.getTime() + 5 * 60_000 + 1);
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('challenge_invalid');
  });

  it('로그인용 챌린지로 출퇴근 확인을 할 수 없다 (목적이 다르면 거부)', async () => {
    const phone = await registerPhone();
    const opts = await svc.beginAssertion('login');
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('challenge_invalid');
  });

  it('서버가 발급하지 않은 챌린지는 거부된다 (패스키 확인 없이 출퇴근 불가 ← B-14)', async () => {
    const phone = await registerPhone();
    expect(await code(svc.verifyAssertion(phone.assert('made-up-challenge'), 'punch'))).toBe('challenge_invalid');
    expect(await code(svc.verifyAssertion({}, 'punch'))).toBe('verification_failed');
  });

  it('sign_count가 계속 0인 폰도 통과한다 ← B-15', async () => {
    const phone = await registerPhone(); // signCount 0
    for (let i = 0; i < 3; i++) {
      const opts = await svc.beginAssertion('punch');
      expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('ok');
    }
    expect(store.passkeys[0].signCount).toBe(0);
  });

  it('sign_count가 늘어나는 폰은 갱신되고, 되돌아가면(복제 의심) 거부된다', async () => {
    const phone = await registerPhone('tok-1', new SoftAuthenticator(RP.rpID, RP.origin, { signCount: 5 }));
    phone.signCount = 6;
    let opts = await svc.beginAssertion('punch');
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('ok');
    expect(store.passkeys[0].signCount).toBe(6);
    phone.signCount = 6;
    opts = await svc.beginAssertion('punch');
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('verification_failed');
  });

  it('해제된 패스키로는 확인되지 않는다 (찍히지 않는다)', async () => {
    const phone = await registerPhone();
    store.passkeys[0].revokedAt = new Date();
    const opts = await svc.beginAssertion('punch');
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('passkey_revoked');
  });

  it('퇴사 처리된 직원의 폰은 거부된다', async () => {
    const phone = await registerPhone();
    store.activeEmployees.delete(EMP);
    const opts = await svc.beginAssertion('punch');
    expect(await code(svc.verifyAssertion(phone.assert(opts.challenge), 'punch'))).toBe('employee_inactive');
  });

  it('등록되지 않은 폰은 거부된다', async () => {
    await registerPhone();
    const stranger = new SoftAuthenticator(RP.rpID, RP.origin);
    const opts = await svc.beginAssertion('punch');
    expect(await code(svc.verifyAssertion(stranger.assert(opts.challenge), 'punch'))).toBe('passkey_unknown');
  });
});

describe('짧은 등록 코드', () => {
  it('코드는 8자, 헷갈리는 글자(0 O 1 I L)가 없다', async () => {
    const { newInviteCode } = await import('@/lib/invite-code');
    for (let i = 0; i < 200; i++) expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });
  it('소문자·띄어쓰기·하이픈으로 입력해도 같은 초대로 찾는다', () => {
    expect(hashToken('k7p2 9qxa')).toBe(hashToken('K7P2-9QXA'));
    expect(hashToken('K7P29QXA')).toBe(hashToken('K7P2-9QXA'));
  });
  it('예전 긴 토큰은 대소문자를 그대로 구분한다', () => {
    const long = 'o6XGYVDOX39N5jty0Tz6BoO3kd3-n1X5kefFUKAmjRU';
    expect(hashToken(long)).not.toBe(hashToken(long.toUpperCase()));
  });
  it('코드로 실제 등록까지 된다', async () => {
    store.invites.set(hashToken('ABCD2345'), invite({ inviteId: 'inv-code' }));
    const opts = await svc.beginRegistration('abcd-2345');
    const phone = new SoftAuthenticator(RP.rpID, RP.origin);
    const r = await svc.finishRegistration('abcd 2345', phone.register(opts.challenge));
    expect(r.employeeId).toBe(EMP);
  });
});
