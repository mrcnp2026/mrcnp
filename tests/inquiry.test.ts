// 문의하기 규칙 (DB 묶음 37, 2026-10-26) — 받는 곳 · 답변 권한 · 입력 검사 · 문의 유형이 메뉴를 빠짐없이 덮는지(번역 이름 포함).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSOLE_APPS } from '@/config/nav';
import { canAnswer, cleanAnswer, cleanInquiry, inquiryTopics, routeFor, topicById } from '@/lib/inquiry';

const KO = JSON.parse(readFileSync(path.join(process.cwd(), 'messages', 'ko.json'), 'utf8')) as { frame: { item: Record<string, string>; app: Record<string, string>; appFull: Record<string, string>; console: Record<string, string> }; inquiry: { space: Record<string, string> } };

describe('문의 유형(메뉴에서 자동)', () => {
  const topics = inquiryTopics();
  it('통합설정의 모든 메뉴가 들어 있고, 열쇠가 겹치지 않는다', () => {
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length);
    const consoleLeaves = CONSOLE_APPS.flatMap((a) => a.groups.flatMap((g) => g.items.map((i) => `console:${a.key}:${i.key}`)));
    expect(consoleLeaves.length).toBeGreaterThan(20);
    for (const id of consoleLeaves) expect(topics.some((t) => t.id === id), id).toBe(true);
    // 큰 것들(근태 설정 · 급여 설정)의 하위 메뉴가 따로 고를 수 있게 들어 있다
    expect(topicById('console:aPay:payPaymentItems')).toBeTruthy();
    expect(topicById('console:aAttendance:setClosing')).toBeTruthy();
    expect(topicById('admin:mPay:payRuns')).toBeTruthy();
    expect(topicById('my:records:myRecords')).toBeTruthy();
  });
  it('화면에 보일 메뉴 이름(번역)이 하나도 빠지지 않았다 — 빠지면 문의하기 화면이 깨진다', () => {
    const missing: string[] = [];
    for (const t of topics) {
      if (!KO.frame.item[t.leafKey]) missing.push(`item.${t.leafKey}`);
      if (t.space === 'console' ? !KO.frame.app[t.appKey] : !KO.frame.appFull[t.appKey]) missing.push(`${t.space === 'console' ? 'app' : 'appFull'}.${t.appKey}`);
    }
    expect(KO.frame.console.company && KO.frame.console.apps).toBeTruthy();
    expect([...new Set(missing)]).toEqual([]);
    for (const s of ['my', 'admin', 'console', 'other']) expect(KO.inquiry.space[s], s).toBeTruthy();
  });
});

describe('받는 곳 · 답변 권한', () => {
  it('직원 · 지점관리자가 보내면 관리자들에게, 관리자가 보내면 시스템관리자에게', () => {
    expect(routeFor('employee')).toBe('ADMIN');
    expect(routeFor('manager')).toBe('ADMIN');
    expect(routeFor('admin')).toBe('SYSTEM');
  });
  it('시스템관리자는 모두에 답하고, 최고관리자는 직원이 보낸 것(ADMIN)만, 자기 문의에는 답하지 않는다', () => {
    const sys = { id: 's', role: 'admin' as const, isSystem: true }, boss = { id: 'b', role: 'admin' as const, isSystem: false }, mgr = { id: 'm', role: 'manager' as const, isSystem: false };
    expect(canAnswer(sys, { toRole: 'SYSTEM', employeeId: 'x' })).toBe(true);
    expect(canAnswer(sys, { toRole: 'ADMIN', employeeId: 'x' })).toBe(true);
    expect(canAnswer(boss, { toRole: 'ADMIN', employeeId: 'x' })).toBe(true);
    expect(canAnswer(boss, { toRole: 'SYSTEM', employeeId: 'x' })).toBe(false);
    expect(canAnswer(mgr, { toRole: 'ADMIN', employeeId: 'x' })).toBe(false);
    expect(canAnswer(sys, { toRole: 'SYSTEM', employeeId: 's' })).toBe(false);
    expect(canAnswer(boss, { toRole: 'ADMIN', employeeId: 'b' })).toBe(false);
  });
});

describe('입력 검사', () => {
  const ok = { space: 'console', topic: 'console:aPay:payPaymentItems', title: '지급 항목이 안 보여요', body: '식대를 넣으려는데 항목이 없습니다.' };
  it('정상 입력은 다듬어서 받는다(제목의 겹 공백 정리)', () => {
    const r = cleanInquiry({ ...ok, title: '  지급   항목이 \n 안 보여요 ' });
    expect(r).toEqual({ ok: true, value: { ...ok, title: '지급 항목이 안 보여요' } });
  });
  it('「기타」는 메뉴를 받지 않고, 메뉴를 모르면 비워도 된다', () => {
    expect(cleanInquiry({ ...ok, space: 'other' })).toMatchObject({ ok: true, value: { space: 'other', topic: null } });
    expect(cleanInquiry({ ...ok, topic: '' })).toMatchObject({ ok: true, value: { topic: null } });
  });
  it('모르는 분류 · 다른 분류의 메뉴 · 너무 짧거나 긴 글은 막는다', () => {
    expect(cleanInquiry({ ...ok, space: 'zzz' })).toEqual({ ok: false, code: 'invalid_space' });
    expect(cleanInquiry({ ...ok, topic: 'console:없는:메뉴' })).toEqual({ ok: false, code: 'invalid_topic' });
    expect(cleanInquiry({ ...ok, space: 'my' })).toEqual({ ok: false, code: 'invalid_topic' }); // 통합설정 메뉴를 내 화면 분류로 보낼 수 없다
    expect(cleanInquiry({ ...ok, title: '가' })).toEqual({ ok: false, code: 'title_invalid' });
    expect(cleanInquiry({ ...ok, title: '가'.repeat(101) })).toEqual({ ok: false, code: 'title_invalid' });
    expect(cleanInquiry({ ...ok, body: ' ' })).toEqual({ ok: false, code: 'body_invalid' });
    expect(cleanInquiry({ ...ok, body: '가'.repeat(2001) })).toEqual({ ok: false, code: 'body_invalid' });
  });
  it('답변: 1~2000자', () => {
    expect(cleanAnswer('네, 확인했습니다.')).toBe('네, 확인했습니다.');
    expect(cleanAnswer('   ')).toBe(null);
    expect(cleanAnswer('가'.repeat(2001))).toBe(null);
    expect(cleanAnswer(undefined)).toBe(null);
  });
});
