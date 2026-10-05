// 검사 스크립트 공통: 초대 링크(/register?token=…)를 연 화면에서 비밀번호를 만들어 로그인한다.
// (2026-10-05 로그인 방식 변경 — 예전에는 여기서 가상 인증기로 "이 폰 등록하기"를 눌렀다.)
// 비밀번호는 실행할 때마다 새로 만든 무작위 값이고 어디에도 남기지 않는다. 화면 언어와 상관없이 동작한다.
import { randomBytes } from 'node:crypto';
import type { Page } from 'playwright-core';

export async function createPassword(p: Page): Promise<void> {
  const password = randomBytes(12).toString('base64url');
  const fields = p.locator('input[type="password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
  await p.locator('form button[type="submit"]').click();
  // 성공하면 입력 칸이 사라지고 "비밀번호를 만들었습니다" + 계속 버튼이 나온다
  await fields.first().waitFor({ state: 'detached', timeout: 30000 });
}
