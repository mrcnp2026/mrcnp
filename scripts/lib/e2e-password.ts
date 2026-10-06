// 검사 스크립트 공통: 초대 링크(/register?token=…)를 연 화면에서 비밀번호를 만들어 로그인하고, 필요하면 출퇴근 기기를 등록한다.
// (2026-10-05 로그인 방식 변경 — 로그인은 아이디 + 비밀번호, 출퇴근 찍기만 등록한 기기 1대 + 지문·얼굴.)
// 비밀번호는 실행할 때마다 새로 만든 무작위 값이고 어디에도 남기지 않는다. 화면 언어와 상관없이 동작한다.
import { randomBytes } from 'node:crypto';
import type { Page } from 'playwright-core';

/** 출퇴근 기기는 폰에서만 등록된다 (2026-10-06) — 검사 브라우저를 폰으로 보이게 하는 사용자 에이전트 */
export const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

export async function createPassword(p: Page): Promise<void> {
  const password = randomBytes(12).toString('base64url');
  const fields = p.locator('input[type="password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
  await p.locator('form button[type="submit"]').click();
  // 성공하면 입력 칸이 사라지고 "비밀번호를 만들었습니다" + 계속 버튼이 나온다
  await fields.first().waitFor({ state: 'detached', timeout: 30000 });
}

/**
 * 출퇴근을 누르는 검사용: 이 브라우저에 가상 인증기(가짜 지문 인식기)를 달고, 직원 홈에서 "이 기기를 출퇴근 기기로 등록"을 누른다.
 * 그 계정에 이미 등록된 기기가 있으면 등록 버튼이 없어 실패한다 — 스크립트가 끝날 때 자기가 만든 등록을 해제해 둘 것.
 */
export async function registerDevice(p: Page): Promise<void> {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: PHONE_UA }); // PC로 보이면 등록 버튼이 나오지 않는다
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await p.goto(new URL('/punch', p.url()).href);
  const button = p.locator('[data-device-register]');
  await button.click();
  await button.waitFor({ state: 'detached', timeout: 30000 });
}
