// 조직도 — 최대 3단계 (본부 › 부서 › 팀 같은 식, 의뢰인 2026-10-05 2단계 → 2026-10-25 3단계). 묶어 보는 용도이고 승인 권한과 무관하다. 순수함수.
// 단계 이름은 정해 두지 않는다 — 회사가 1단계 · 2단계 · 3단계에 어떤 이름을 쓰든 같은 구조다. 3단계 제한은 DB 트리거(org_groups_max_depth)도 지킨다.
export type OrgGroup = { id: string; name: string; parentId: string | null; sortOrder: number; active: boolean };
/** 맨 위 조직 + 그 밑의 모든 조직(깊이 순서대로 펼친 목록). depth = 맨 위가 1, label = 맨 위를 뺀 경로(예: 부서 › 팀) */
export type OrgDept = OrgGroup & { teams: (OrgGroup & { depth: number; label: string })[] };

export const MAX_DEPTH = 3;
const byOrder = (a: OrgGroup, b: OrgGroup) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** 맨 위 조직 목록 + 각 조직 밑의 모든 하위 조직(트리 순서로 펼침). 숨긴 그룹은 뺀다 (includeHidden이면 포함) */
export function buildOrgTree(groups: OrgGroup[], includeHidden = false): OrgDept[] {
  const shown = groups.filter((g) => includeHidden || g.active);
  const kids = (id: string) => shown.filter((g) => g.parentId === id).sort(byOrder);
  const walk = (parent: OrgGroup, depth: number, trail: string[]): OrgDept['teams'] =>
    kids(parent.id).flatMap((c) => [{ ...c, depth, label: [...trail, c.name].join(' › ') }, ...walk(c, depth + 1, [...trail, c.name])]);
  return shown
    .filter((g) => !g.parentId)
    .sort(byOrder)
    .map((d) => ({ ...d, teams: walk(d, 2, []) }));
}

/** 가지 모양 그대로의 트리 (조직도 그림 · 관리 화면용). 숨긴 그룹은 includeHidden일 때만 */
export type OrgNode = OrgGroup & { children: OrgNode[] };
export function buildNested(groups: OrgGroup[], includeHidden = false): OrgNode[] {
  const shown = groups.filter((g) => includeHidden || g.active);
  const make = (g: OrgGroup, depth: number): OrgNode => ({ ...g, children: depth >= MAX_DEPTH ? [] : shown.filter((c) => c.parentId === g.id).sort(byOrder).map((c) => make(c, depth + 1)) });
  return shown.filter((g) => !g.parentId).sort(byOrder).map((g) => make(g, 1));
}

/** 고르기 목록용: 모든 조직을 트리 순서로, 이름은 「본부 › 부서 › 팀」 경로 */
export function orgOptions(groups: OrgGroup[], includeHidden = false): { id: string; label: string }[] {
  return buildOrgTree(groups, includeHidden).flatMap((d) => [{ id: d.id, label: d.name }, ...d.teams.map((x) => ({ id: x.id, label: `${d.name} › ${x.label}` }))]);
}

/** 그 그룹의 맨 위 조직 (자기 자신이 맨 위면 자기 자신) */
export function topOf<G extends { id: string; parentId: string | null }>(groups: readonly G[], id: string | null | undefined): G | undefined {
  let g = id ? groups.find((x) => x.id === id) : undefined;
  for (let n = 0; g?.parentId && n < MAX_DEPTH; n++) g = groups.find((x) => x.id === g!.parentId) ?? g;
  return g;
}

/** '본부 › 부서 › 팀' 같은 경로. 없는 그룹이면 null */
export function groupPath(groups: OrgGroup[], id: string | null | undefined): string | null {
  const names: string[] = [];
  let g = id ? groups.find((x) => x.id === id) : null;
  if (!g) return null;
  for (let n = 0; g && n < MAX_DEPTH + 1; n++) {
    names.unshift(g.name);
    g = g.parentId ? groups.find((x) => x.id === g!.parentId) : undefined;
  }
  return names.join(' › ');
}

/** 그 그룹과 그 밑의 모든 하위 그룹 id — "부서로 걸러 보기"는 소속 팀 직원도 포함한다 */
export function groupScope(groups: readonly { id: string; parentId: string | null }[], id: string): Set<string> {
  const out = new Set([id]);
  for (let n = 0; n < MAX_DEPTH; n++) for (const g of groups) if (g.parentId && out.has(g.parentId)) out.add(g.id);
  return out;
}

/** 직원을 맨 위 조직 아래로 묶는다. 어디에도 없으면(미배정·숨긴 그룹) 마지막 '미배정' 묶음 */
export function groupPeople<P extends { groupId: string | null }>(
  groups: OrgGroup[],
  people: P[],
): { dept: OrgDept | null; direct: P[]; teams: { team: OrgDept['teams'][number]; people: P[] }[]; count: number }[] {
  const tree = buildOrgTree(groups);
  const placed = new Set<P>();
  const out = tree.map((dept) => {
    const direct = people.filter((p) => p.groupId === dept.id);
    const teams = dept.teams.map((team) => ({ team, people: people.filter((p) => p.groupId === team.id) }));
    for (const p of [...direct, ...teams.flatMap((t) => t.people)]) placed.add(p);
    return { dept: dept as OrgDept | null, direct, teams, count: direct.length + teams.reduce((a, t) => a + t.people.length, 0) };
  });
  const rest = people.filter((p) => !placed.has(p));
  if (rest.length || out.length === 0) out.push({ dept: null, direct: rest, teams: [], count: rest.length });
  return out;
}

export function cleanGroupName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return s.length >= 1 && s.length <= 40 ? s : null;
}

/** 휴대폰 번호: 비우면 null, 모양이 틀리면 undefined. 숫자·+·- 만 (공백은 뺀다) */
export function cleanPhone(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, '');
  if (s === '') return null;
  return /^[0-9+][0-9-]{6,19}$/.test(s) ? s : undefined;
}

/** 직무/직급: 비우면 null, 40자 넘으면 undefined */
export function cleanJobTitle(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (s === '') return null;
  return s.length <= 40 ? s : undefined;
}
