// 조직도 (부서 › 팀 2단계) — 묶어 보기
import { describe, expect, it } from 'vitest';
import { buildOrgTree, cleanGroupName, cleanJobTitle, cleanPhone, groupPath, groupPeople, groupScope, type OrgGroup } from '@/lib/org';

const g = (id: string, name: string, parentId: string | null = null, sortOrder = 0, active = true): OrgGroup => ({ id, name, parentId, sortOrder, active });
const GROUPS = [g('d2', '영업부', null, 2), g('d1', '경영지원', null, 1), g('t1', '영업 1팀', 'd2', 1), g('t2', '영업 2팀', 'd2', 2), g('t3', '옛 팀', 'd2', 3, false)];

describe('조직도', () => {
  it('부서는 순서대로, 팀은 부서 밑에. 숨긴 그룹은 빠진다', () => {
    const tree = buildOrgTree(GROUPS);
    expect(tree.map((d) => d.name)).toEqual(['경영지원', '영업부']);
    expect(tree[1].teams.map((t) => t.name)).toEqual(['영업 1팀', '영업 2팀']);
    expect(buildOrgTree(GROUPS, true)[1].teams.length).toBe(3);
  });

  it('소속 표시는 "부서 › 팀" 또는 "부서"', () => {
    expect(groupPath(GROUPS, 't1')).toBe('영업부 › 영업 1팀');
    expect(groupPath(GROUPS, 'd1')).toBe('경영지원');
    expect(groupPath(GROUPS, null)).toBeNull();
    expect(groupPath(GROUPS, 'nope')).toBeNull();
  });

  it('부서로 걸러 보면 그 밑의 팀 직원도 포함된다', () => {
    expect([...groupScope(GROUPS, 'd2')].sort()).toEqual(['d2', 't1', 't2', 't3']);
    expect([...groupScope(GROUPS, 't1')]).toEqual(['t1']);
  });

  it('직원을 부서 › 팀으로 묶고, 소속이 없거나 숨긴 그룹이면 미배정', () => {
    const people = [{ n: 'a', groupId: 'd1' }, { n: 'b', groupId: 't1' }, { n: 'c', groupId: 'd2' }, { n: 'd', groupId: null }, { n: 'e', groupId: 't3' }];
    const s = groupPeople(GROUPS, people);
    expect(s.map((x) => [x.dept?.name ?? null, x.count])).toEqual([['경영지원', 1], ['영업부', 2], [null, 2]]);
    expect(s[1].direct.map((p) => p.n)).toEqual(['c']);
    expect(s[1].teams.map((t) => t.people.map((p) => p.n))).toEqual([['b'], []]);
    expect(s[2].direct.map((p) => p.n)).toEqual(['d', 'e']);
  });

  it('그룹이 하나도 없으면 미배정 묶음 하나', () => {
    expect(groupPeople([], [{ groupId: null }]).map((x) => [x.dept, x.count])).toEqual([[null, 1]]);
  });
});

describe('직원 등록 입력값', () => {
  it('그룹 이름: 1~40자, 앞뒤 공백 제거', () => {
    expect(cleanGroupName('  영업부 ')).toBe('영업부');
    expect(cleanGroupName('')).toBeNull();
    expect(cleanGroupName('x'.repeat(41))).toBeNull();
    expect(cleanGroupName(3)).toBeNull();
  });

  it('휴대폰: 비우면 null, 숫자·+·- 만, 공백은 뺀다', () => {
    expect(cleanPhone('')).toBeNull();
    expect(cleanPhone(undefined)).toBeNull();
    expect(cleanPhone('010 1234 5678')).toBe('01012345678');
    expect(cleanPhone('+82-10-1234-5678')).toBe('+82-10-1234-5678');
    expect(cleanPhone('010-abcd')).toBeUndefined();
    expect(cleanPhone('123')).toBeUndefined();
  });

  it('직무·직급: 비우면 null, 40자까지', () => {
    expect(cleanJobTitle(' 대리 ')).toBe('대리');
    expect(cleanJobTitle('')).toBeNull();
    expect(cleanJobTitle('x'.repeat(41))).toBeUndefined();
  });
});
