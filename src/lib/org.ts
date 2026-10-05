// 조직도 — 부서 › 팀 2단계 (의뢰인 2026-10-05). 묶어 보는 용도이고 승인 권한과 무관하다. 순수함수.
export type OrgGroup = { id: string; name: string; parentId: string | null; sortOrder: number; active: boolean };
export type OrgDept = OrgGroup & { teams: OrgGroup[] };

const byOrder = (a: OrgGroup, b: OrgGroup) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** 부서 목록 + 각 부서의 팀. 숨긴 그룹은 뺀다 (includeHidden이면 포함) */
export function buildOrgTree(groups: OrgGroup[], includeHidden = false): OrgDept[] {
  const shown = groups.filter((g) => includeHidden || g.active);
  return shown
    .filter((g) => !g.parentId)
    .sort(byOrder)
    .map((d) => ({ ...d, teams: shown.filter((g) => g.parentId === d.id).sort(byOrder) }));
}

/** '부서 › 팀' 또는 '부서'. 없는 그룹이면 null */
export function groupPath(groups: OrgGroup[], id: string | null | undefined): string | null {
  const g = id ? groups.find((x) => x.id === id) : null;
  if (!g) return null;
  const parent = g.parentId ? groups.find((x) => x.id === g.parentId) : null;
  return parent ? `${parent.name} › ${g.name}` : g.name;
}

/** 그 그룹과 (부서라면) 그 밑의 팀 id — "부서로 걸러 보기"는 소속 팀 직원도 포함한다 */
export function groupScope(groups: OrgGroup[], id: string): Set<string> {
  return new Set([id, ...groups.filter((g) => g.parentId === id).map((g) => g.id)]);
}

/** 직원을 부서 › 팀으로 묶는다. 어디에도 없으면(미배정·숨긴 그룹) 마지막 '미배정' 묶음 */
export function groupPeople<P extends { groupId: string | null }>(
  groups: OrgGroup[],
  people: P[],
): { dept: OrgDept | null; direct: P[]; teams: { team: OrgGroup; people: P[] }[]; count: number }[] {
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
