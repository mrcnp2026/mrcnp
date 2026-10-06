// 출퇴근 기기 등록(패스키) — 7-12, 4-11.
//
// ★ 2026-10-05 의뢰인 결정: 로그인은 아이디 + 비밀번호(어느 기기에서나), **출퇴근 찍기만** 등록한 기기 1대 + 지문·얼굴 확인.
//   - 등록: 로그인한 직원이 자기 폰에서 직접 한다 (beginDeviceRegistration). 초대 코드가 필요 없다.
//   - 바꾸기: 관리자가 기존 기기를 해제해야 새 기기를 등록할 수 있다 (직원당 활성 1개 — one_active_passkey).
//   - 초대 토큰으로 등록하는 예전 길(beginRegistration)은 비상 초대·옛 검사 스크립트용으로만 남아 있다.
//
// 저장소(PasskeyStore)를 주입받는다. 운영은 passkey-store.ts(Supabase), 검사는 메모리 저장소를 쓴다.
// 그래야 실제 DB에 지울 수 없는 시험 기록을 남기지 않고 1회용 챌린지·해제·sign_count 규칙을 검사할 수 있다.
//
// ★ 서버는 생체정보를 받지 않는다. 지문·얼굴 확인은 폰 안에서 끝나고, 서버는 공개키와 서명만 본다.
// ★ 출퇴근 API는 verifyAssertion을 통과한 요청만 받는다. 로그인 세션만으로 찍히게 하지 마라 (요점 4, B-14) —
//   비밀번호를 동료에게 알려 줘도 그 동료의 폰으로는 찍히지 않게 하는 것이 이 확인이다.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash } from 'node:crypto';
import { normalizeInviteToken } from '@/lib/invite-code';

export type ChallengePurpose = 'register' | 'login' | 'punch';

export type StoredPasskey = {
  id: string;
  employeeId: string;
  credentialId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports: string[] | null;
  revokedAt: Date | null;
};

export type InviteInfo = {
  inviteId: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  locale: string; // 초대 화면을 직원 언어로 보여 주려고 (관리자가 초대 때 정한 언어)
  employeeActive: boolean;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  issuedVia: 'admin' | 'emergency';
};

export interface PasskeyStore {
  findInvite(tokenHash: string): Promise<InviteInfo | null>;
  hasActivePasskey(employeeId: string): Promise<boolean>;
  isEmployeeActive(employeeId: string): Promise<boolean>;
  saveChallenge(c: { challenge: string; purpose: ChallengePurpose; inviteId: string | null; expiresAt: Date }): Promise<void>;
  /** 1회용: 아직 안 쓰였고 만료 전이며 목적·초대가 맞으면 사용 처리하고 true. 한 문장(조건부 update)으로 해야 동시 사용이 막힌다 */
  consumeChallenge(c: { challenge: string; purpose: ChallengePurpose; inviteId: string | null; now: Date }): Promise<boolean>;
  /** 초대 확인·저장·초대 사용 처리를 한 트랜잭션으로 (DB 함수 register_passkey) */
  registerPasskey(p: {
    tokenHash: string;
    credentialId: string;
    publicKey: Uint8Array;
    signCount: number;
    transports: string[] | null;
    deviceType: string;
    backedUp: boolean;
    deviceLabel: string | null;
  }): Promise<{ passkeyId: string; employeeId: string }>;
  findPasskey(credentialId: string): Promise<StoredPasskey | null>;
  /** 그 직원의 지금 출퇴근 기기 (활성 패스키). 없으면 null */
  activePasskeyOf(employeeId: string): Promise<StoredPasskey | null>;
  /** 로그인한 직원이 직접 등록 — 활성 기기가 이미 있으면 already_registered (DB 유일 인덱스가 최종 방어) */
  addPasskey(p: {
    employeeId: string;
    credentialId: string;
    publicKey: Uint8Array;
    signCount: number;
    transports: string[] | null;
    deviceType: string;
    backedUp: boolean;
    deviceLabel: string | null;
  }): Promise<{ passkeyId: string }>;
  touchPasskey(id: string, signCount: number, now: Date): Promise<void>;
}

export type RpConfig = { rpID: string; rpName: string; origin: string; challengeTtlMin: number };

/** 화면에서 직원 언어로 바꿔 보여 줄 오류 코드 (번역 키 errors.<code>) */
export type PasskeyErrorCode =
  | 'invite_invalid' // 없음·만료·사용됨·취소됨
  | 'employee_inactive'
  | 'already_registered' // 활성 폰이 이미 있음 → 관리자가 해제해야 함 (4-11)
  | 'device_required' // 출퇴근 기기를 아직 등록하지 않음
  | 'wrong_person' // 다른 사람 계정에 등록된 기기
  | 'challenge_invalid' // 1회용·5분 (요점 2)
  | 'verification_failed'
  | 'user_verification_missing' // 화면 잠금 없음 (요점 1)
  | 'passkey_unknown'
  | 'passkey_revoked'; // 요점 7

export class PasskeyError extends Error {
  constructor(public code: PasskeyErrorCode) {
    super(code);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(normalizeInviteToken(token)).digest('hex');
}

/** 브라우저 응답의 clientDataJSON에서 챌린지를 꺼낸다 (서명 검증 전 — 어느 챌린지를 쓰려는지 알기 위해서만) */
function challengeOf(response: { response?: { clientDataJSON?: unknown } }): string {
  const raw = response?.response?.clientDataJSON;
  if (typeof raw !== 'string') throw new PasskeyError('verification_failed');
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { challenge?: unknown };
    if (typeof json.challenge !== 'string') throw new Error();
    return json.challenge;
  } catch {
    throw new PasskeyError('verification_failed');
  }
}

/** 기기 이름은 관리자가 알아볼 정도로만 (부록 R-5: 기기명). 사용자 에이전트 원문은 저장하지 않는다 */
export function deviceLabelFrom(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Mac OS X/i.test(userAgent)) return 'Mac';
  return null;
}

/** 폰·태블릿인가 — 출퇴근 기기는 들고 다니는 본인 폰에만 등록한다 (2026-10-06 의뢰인: PC에 등록 버튼이 나오면 안 된다) */
export function isPhoneUserAgent(userAgent: string | null): boolean {
  return !!userAgent && /iPhone|iPad|iPod|Android/i.test(userAgent);
}

export function createPasskeyService(store: PasskeyStore, rp: RpConfig, clock: () => Date = () => new Date()) {
  const expiry = () => new Date(clock().getTime() + rp.challengeTtlMin * 60_000);

  async function validInvite(inviteToken: string): Promise<InviteInfo> {
    const inv = await store.findInvite(hashToken(inviteToken));
    const now = clock();
    if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt <= now) throw new PasskeyError('invite_invalid');
    if (!inv.employeeActive) throw new PasskeyError('employee_inactive');
    // 일반 초대는 활성 폰이 있으면 막는다. 비상 초대(R-2의 4)만 DB 함수가 기존 폰을 해제하고 바꾼다
    if (inv.issuedVia !== 'emergency' && (await store.hasActivePasskey(inv.employeeId))) {
      throw new PasskeyError('already_registered');
    }
    return inv;
  }

  /** 초대 QR을 연 직원에게 보여 줄 정보 (이름만). 토큰이 틀리면 오류 */
  async function describeInvite(inviteToken: string): Promise<{ name: string; employeeNo: string; locale: string }> {
    const inv = await validInvite(inviteToken);
    return { name: inv.name, employeeNo: inv.employeeNo, locale: inv.locale };
  }

  async function beginRegistration(inviteToken: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const inv = await validInvite(inviteToken);
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      // 요점 5: 계정 식별자는 사번. 이메일을 요구하지 않는다
      userName: inv.employeeNo,
      userDisplayName: inv.name,
      userID: new TextEncoder().encode(inv.employeeId),
      attestationType: 'none',
      authenticatorSelection: {
        // 그 기기에 내장된 잠금(폰의 지문·얼굴·PIN, PC의 Windows Hello)으로만 등록한다.
        // USB 보안키는 빌려줄 수 있어 "직원당 폰 1대"(4-11)를 무너뜨리고, 브라우저가 USB를 먼저 묻는 혼란도 생긴다 (2026-10-02 실측)
        authenticatorAttachment: 'platform',
        residentKey: 'required', // 사번을 입력하지 않고 "폰으로 로그인" 한 번에 되게
        userVerification: 'required', // 요점 1: 화면 잠금(지문·얼굴·PIN) 필수
      },
      timeout: rp.challengeTtlMin * 60_000,
    });
    await store.saveChallenge({ challenge: options.challenge, purpose: 'register', inviteId: inv.inviteId, expiresAt: expiry() });
    return options;
  }

  async function finishRegistration(
    inviteToken: string,
    response: unknown,
    deviceLabel: string | null = null,
  ): Promise<{ employeeId: string; passkeyId: string }> {
    const inv = await validInvite(inviteToken);
    const res = response as RegistrationResponseJSON;
    const challenge = challengeOf(res);
    if (!(await store.consumeChallenge({ challenge, purpose: 'register', inviteId: inv.inviteId, now: clock() }))) {
      throw new PasskeyError('challenge_invalid');
    }
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: res,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      throw new PasskeyError(/user verification/i.test(String(e)) ? 'user_verification_missing' : 'verification_failed');
    }
    if (!v.verified) throw new PasskeyError('verification_failed');
    const info = v.registrationInfo;
    return store.registerPasskey({
      tokenHash: hashToken(inviteToken),
      credentialId: info.credential.id,
      publicKey: info.credential.publicKey, // 공개키만 저장한다
      signCount: info.credential.counter,
      transports: info.credential.transports ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp, // 4-11 알려진 한계: 동기화된 패스키인지 기록만
      deviceLabel,
    });
  }

  const registrationOptions = (who: { employeeId: string; employeeNo: string; name: string }) =>
    generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userName: who.employeeNo, // 요점 5: 계정 식별자는 사번
      userDisplayName: who.name,
      userID: new TextEncoder().encode(who.employeeId),
      attestationType: 'none',
      authenticatorSelection: {
        // 그 기기에 내장된 잠금(폰의 지문·얼굴·PIN)으로만. USB 보안키는 빌려줄 수 있어 "기기 1대"를 무너뜨린다
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: rp.challengeTtlMin * 60_000,
    });

  /** 로그인한 직원이 지금 쓰는 기기를 출퇴근 기기로 등록 — 1단계 */
  async function beginDeviceRegistration(who: { employeeId: string; employeeNo: string; name: string }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    if (await store.hasActivePasskey(who.employeeId)) throw new PasskeyError('already_registered');
    const options = await registrationOptions(who);
    await store.saveChallenge({ challenge: options.challenge, purpose: 'register', inviteId: null, expiresAt: expiry() });
    return options;
  }

  /** 2단계: 기기의 응답 검증 → 공개키 저장 */
  async function finishDeviceRegistration(employeeId: string, response: unknown, deviceLabel: string | null = null): Promise<{ passkeyId: string; credentialId: string }> {
    const res = response as RegistrationResponseJSON;
    const challenge = challengeOf(res);
    if (!(await store.consumeChallenge({ challenge, purpose: 'register', inviteId: null, now: clock() }))) {
      throw new PasskeyError('challenge_invalid');
    }
    if (await store.hasActivePasskey(employeeId)) throw new PasskeyError('already_registered');
    let v;
    try {
      v = await verifyRegistrationResponse({ response: res, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: true });
    } catch (e) {
      throw new PasskeyError(/user verification/i.test(String(e)) ? 'user_verification_missing' : 'verification_failed');
    }
    if (!v.verified) throw new PasskeyError('verification_failed');
    const info = v.registrationInfo;
    const { passkeyId } = await store.addPasskey({
      employeeId,
      credentialId: info.credential.id,
      publicKey: info.credential.publicKey,
      signCount: info.credential.counter,
      transports: info.credential.transports ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      deviceLabel,
    });
    return { passkeyId, credentialId: info.credential.id };
  }

  /**
   * 출퇴근 확인 1단계 — 그 직원이 등록한 기기만 답할 수 있게 지정한다 (allowCredentials).
   * 등록하지 않은 기기에서 브라우저가 "보안 키(USB)"를 찾으라고 하는 혼란을 줄인다.
   */
  async function beginPunchAssertion(employeeId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const pk = await store.activePasskeyOf(employeeId);
    if (!pk) throw new PasskeyError('device_required');
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'required', // 출퇴근마다 지문·얼굴·PIN을 다시 묻는다 (4-11)
      allowCredentials: [{ id: pk.credentialId, transports: ['internal'] }],
      timeout: rp.challengeTtlMin * 60_000,
    });
    await store.saveChallenge({ challenge: options.challenge, purpose: 'punch', inviteId: null, expiresAt: expiry() });
    return options;
  }

  /** 출퇴근 확인 2단계 — 서명이 맞고, 그 기기가 **로그인한 본인**의 것이어야 한다 */
  async function verifyPunch(employeeId: string, response: unknown): Promise<{ passkeyId: string }> {
    const who = await verifyAssertion(response, 'punch');
    if (who.employeeId !== employeeId) throw new PasskeyError('wrong_person');
    return { passkeyId: who.passkeyId };
  }

  async function beginAssertion(purpose: 'login' | 'punch' = 'login'): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'required', // 출퇴근마다 지문·PIN을 다시 묻는다 (4-11)
      timeout: rp.challengeTtlMin * 60_000,
    });
    await store.saveChallenge({ challenge: options.challenge, purpose, inviteId: null, expiresAt: expiry() });
    return options;
  }

  async function verifyAssertion(
    response: unknown,
    purpose: 'login' | 'punch' = 'login',
  ): Promise<{ employeeId: string; passkeyId: string }> {
    const res = response as AuthenticationResponseJSON;
    const challenge = challengeOf(res);
    // 1회용: 검증 전에 먼저 사용 처리한다. 검증이 실패해도 같은 챌린지는 다시 못 쓴다
    if (!(await store.consumeChallenge({ challenge, purpose, inviteId: null, now: clock() }))) {
      throw new PasskeyError('challenge_invalid');
    }
    const pk = typeof res?.id === 'string' ? await store.findPasskey(res.id) : null;
    if (!pk) throw new PasskeyError('passkey_unknown');
    if (pk.revokedAt) throw new PasskeyError('passkey_revoked'); // 요점 7
    if (!(await store.isEmployeeActive(pk.employeeId))) throw new PasskeyError('employee_inactive');

    let v;
    try {
      // 요점 3: sign_count 비교. 저장값과 새 값이 둘 다 0이면 라이브러리가 비교를 건너뛴다 (B-15)
      v = await verifyAuthenticationResponse({
        response: res,
        expectedChallenge: challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: pk.credentialId,
          publicKey: new Uint8Array(pk.publicKey), // 라이브러리가 ArrayBuffer 기반 배열을 요구한다
          counter: pk.signCount,
          transports: pk.transports ?? undefined,
        },
        requireUserVerification: true,
      });
    } catch (e) {
      throw new PasskeyError(/user verification/i.test(String(e)) ? 'user_verification_missing' : 'verification_failed');
    }
    if (!v.verified) throw new PasskeyError('verification_failed');
    await store.touchPasskey(pk.id, v.authenticationInfo.newCounter, clock());
    return { employeeId: pk.employeeId, passkeyId: pk.id };
  }

  return { describeInvite, beginRegistration, finishRegistration, beginDeviceRegistration, finishDeviceRegistration, beginPunchAssertion, verifyPunch, beginAssertion, verifyAssertion };
}

export type PasskeyService = ReturnType<typeof createPasskeyService>;
