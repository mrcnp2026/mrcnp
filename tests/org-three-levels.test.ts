// 조직도 3단계 (2026-10-25 의뢰인): 본부 › 부서 › 팀
import { describe, expect, it } from 'vitest';
import { expandGroups } from '@/lib/manager-rules';
import { buildNested, buildOrgTree, groupPath, groupPeople, groupScope, orgOptions, topOf, type OrgGroup } from '@/lib/org';

const g = (id: string, name: string, parentId: string | null, sortOrder = 0, active = true): OrgGroup => ({ id, name, parentId, sortOrder, active });
const G = [
  g('hq', '본사', null, 1),
  g('ops', '운영본부', 'hq', 1),
  g('line', '생산팀', 'ops', 1),
  g('pack', '포장팀', 'ops', 2),
  g('hr', '경영지원', 'hq', 2),
  g('fac', '공장', null, 2),
  g('old', '예전 팀', 'fac', 1, false),
];

describe('조직 3단계', () => {
  it('경로는 단계 수만큼 이어진다', () => {
    expect(groupPath(G, 'hq')).toBe('본사');
    expect(groupPath(G, 'ops')).toBe('본사 › 운영본부');
    expect(groupPath(G, 'line')).toBe('본사 › 운영본부 › 생산팀');
    expect(groupPath(G, 'none')).toBeNull();
  });
  it('맨 위 조직을 찾는다', () => {
    expect(topOf(G, 'line')?.id).toBe('hq');
    expect(topOf(G, 'fac')?.id).toBe('fac');
    expect(topOf(G, null)).toBeUndefined();
  });
  it('조직으로 걸러 볼 때 모든 하위 조직의 직원이 포함된다', () => {
    expect([...groupScope(G, 'hq')].sort()).toEqual(['hq', 'hr', 'line', 'ops', 'pack'].sort());
    expect([...groupScope(G, 'ops')].sort()).toEqual(['line', 'ops', 'pack']);
    expect([...groupScope(G, 'line')]).toEqual(['line']);
  });
  it('지점관리자가 맡은 조직 밑의 모든 하위 조직이 범위에 든다', () => {
    expect([...expandGroups(G, ['hq'])].sort()).toEqual(['hq', 'hr', 'line', 'ops', 'pack'].sort());
    expect([...expandGroups(G, ['ops'])].sort()).toEqual(['line', 'ops', 'pack']);
  });
  it('가지 모양 트리와 펼친 목록이 트리 순서를 지킨다 (숨긴 것은 뺀다)', () => {
    const nested = buildNested(G);
    expect(nested.map((n) => n.name)).toEqual(['본사', '공장']);
    expect(nested[0].children.map((n) => n.name)).toEqual(['운영본부', '경영지원']);
    expect(nested[0].children[0].children.map((n) => n.name)).toEqual(['생산팀', '포장팀']);
    expect(nested[1].children).toEqual([]); // 숨긴 팀
    expect(orgOptions(G).map((o) => o.label)).toEqual(['본사', '본사 › 운영본부', '본사 › 운영본부 › 생산팀', '본사 › 운영본부 › 포장팀', '본사 › 경영지원', '공장']);
    expect(orgOptions(G, true).map((o) => o.label)).toContain('공장 › 예전 팀');
  });
  it('3단계를 넘는 가지는 트리에 넣지 않는다', () => {
    const deep = [...G, g('x', '4단계', 'line', 1)];
    expect(buildNested(deep)[0].children[0].children[0].children).toEqual([]);
  });
  it('맨 위 조직 아래 펼친 목록에는 단계와 경로가 붙는다', () => {
    const top = buildOrgTree(G)[0];
    expect(top.teams.map((t) => [t.name, t.depth, t.label])).toEqual([
      ['운영본부', 2, '운영본부'],
      ['생산팀', 3, '운영본부 › 생산팀'],
      ['포장팀', 3, '운영본부 › 포장팀'],
      ['경영지원', 2, '경영지원'],
    ]);
  });
  it('직원 묶기: 3단계 조직의 직원도 맨 위 조직 묶음에 든다', () => {
    const people = [{ id: 1, groupId: 'line' }, { id: 2, groupId: 'hq' }, { id: 3, groupId: 'fac' }, { id: 4, groupId: null }];
    const s = groupPeople(G, people);
    expect(s[0].dept?.name).toBe('본사');
    expect(s[0].count).toBe(2);
    expect(s[0].teams.find((t) => t.team.id === 'line')?.people.map((p) => p.id)).toEqual([1]);
    expect(s[s.length - 1].dept).toBeNull(); // 미배정
  });
});
