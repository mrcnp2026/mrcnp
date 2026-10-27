// 문의하기 — 순수 규칙 (2026-10-26 의뢰인: 종 옆 문의하기 · 통합설정의 모든 메뉴를 문의 유형으로 · 푸시로 알림). DB 묶음 37.
// 문의 유형은 메뉴 구성(config/nav.ts)에서 자동으로 만든다 — 메뉴가 늘면 유형도 저절로 늘어난다(따로 적어 두지 않는다).
import { ADMIN_APPS, CONSOLE_APPS, MY_APPS, type App } from '@/config/nav';
import { cleanText } from '@/lib/text';

export const SPACES = ['my', 'admin', 'console', 'other'] as const;
export type InquirySpace = (typeof SPACES)[number];
/** 메뉴를 가진 큰 분류 (그 밖은 메뉴 없이 「기타」) */
export type MenuSpace = Exclude<InquirySpace, 'other'>;
export const TITLE_MAX = 100;
export const BODY_MAX = 2000;
export const ANSWER_MAX = 2000;
/** 답을 받지 못한 문의를 이만큼 쌓아 두고 또 보낼 수는 없다 — 같은 걸 여러 번 보내는 것을 막는다 */
export const OPEN_LIMIT = 10;

export type Topic = { id: string; space: MenuSpace; appKey: string; section?: 'company' | 'apps'; leafKey: string };

const LISTS: Record<MenuSpace, readonly App[]> = { my: MY_APPS, admin: ADMIN_APPS, console: CONSOLE_APPS };

/** 고를 수 있는 모든 메뉴 — 열쇠는 「분류:앱:항목」 */
export function inquiryTopics(): Topic[] {
  const out: Topic[] = [];
  for (const space of Object.keys(LISTS) as MenuSpace[]) {
    for (const app of LISTS[space]) for (const g of app.groups) for (const leaf of g.items) out.push({ id: `${space}:${app.key}:${leaf.key}`, space, appKey: app.key, section: app.section, leafKey: leaf.key });
  }
  return out;
}
export const topicById = (id: string | null | undefined): Topic | undefined => (id ? inquiryTopics().find((t) => t.id === id) : undefined);

export type Role = 'admin' | 'manager' | 'employee';
export type ToRole = 'ADMIN' | 'SYSTEM';
/** 받는 곳 — 직원(지점관리자 포함)이 보내면 관리자들에게, 관리자가 보내면 시스템관리자에게 */
export const routeFor = (role: Role): ToRole => (role === 'admin' ? 'SYSTEM' : 'ADMIN');

/** 이 문의에 답할 수 있는가 — 시스템관리자는 모두(본인이 보낸 것도: 관리자가 보내면 받는 곳이 시스템관리자 본인뿐일 수 있다), 최고관리자는 직원이 보낸 것(ADMIN)만. 최고관리자는 자기 문의에 답하지 않는다 */
export function canAnswer(me: { id: string; role: Role; isSystem: boolean }, q: { toRole: ToRole; employeeId: string }): boolean {
  if (me.isSystem) return true;
  if (q.employeeId === me.id) return false;
  return me.role === 'admin' && q.toRole === 'ADMIN';
}

export type InquiryInput = { space: InquirySpace; topic: string | null; title: string; body: string };
export type Cleaned = { ok: true; value: InquiryInput } | { ok: false; code: 'invalid_space' | 'invalid_topic' | 'title_invalid' | 'body_invalid' };

export function cleanInquiry(b: Record<string, unknown>): Cleaned {
  const space = (SPACES as readonly unknown[]).includes(b.space) ? (b.space as InquirySpace) : null;
  if (!space) return { ok: false, code: 'invalid_space' };
  let topic: string | null = null;
  if (space !== 'other' && typeof b.topic === 'string' && b.topic !== '') {
    const t = topicById(b.topic);
    if (!t || t.space !== space) return { ok: false, code: 'invalid_topic' };
    topic = t.id;
  }
  const title = cleanText(b.title).replace(/\s+/g, ' ');
  if (title.length < 2 || title.length > TITLE_MAX) return { ok: false, code: 'title_invalid' };
  const body = cleanText(b.body);
  if (body.length < 2 || body.length > BODY_MAX) return { ok: false, code: 'body_invalid' };
  return { ok: true, value: { space, topic, title, body } };
}

export const cleanAnswer = (v: unknown): string | null => {
  const a = cleanText(v);
  return a.length >= 1 && a.length <= ANSWER_MAX ? a : null;
};
