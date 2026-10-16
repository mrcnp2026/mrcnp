// 휴가 원장 — 연차 정책(통상 방식) · 연차 후보 만들기와 승인 · 직원별 잔여(원장과 예전 계산 대조) · 지급 건과 원장 내역 (PRD v1.3 36 · 38장).
// ★ 대조 단계: 직원에게 보이는 잔여는 아직 예전 계산이다. 이 화면에서 두 숫자가 맞는지 본 뒤에 원장으로 바꾼다.
import { getTranslations } from 'next-intl/server';
import { ListHead } from '@/components/listframe';
import { PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { calcLeaveBalance } from '@/lib/leave';
import { loadAllLeaveTypes, loadLeaveGrants, loadLeaveRequests } from '@/lib/leave-data';
import { entriesFor, ledgerBalance, lotRemaining, minutesToDays, splitCarry } from '@/lib/leave-ledger';
import { loadDefaultPolicies, loadEntries, loadExpiring, loadGroupPolicies, loadLots, loadPolicyGroups, loadSettlements } from '@/lib/leave-ledger-data';
import { hiddenTestIds } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { toKstDate } from '@/lib/time';
import { LedgerBoard, type BalanceLine, type EntryLine, type LotLine } from './LedgerBoard';
import { Fold } from '@/components/Fold';
import { PolicyGroups } from './PolicyGroups';

export default async function LeaveLedgerPage({ searchParams }: { searchParams: Promise<{ emp?: string; live?: string; pg?: string }> }) {
  const tGear = await getTranslations('frame');
  const [t, sp] = await Promise.all([getTranslations('admin.leaveLedger'), searchParams]);
  const today = toKstDate(new Date());
  const practice = OFFICE.practiceMode && sp.live !== '1';
  const pgroups = await loadPolicyGroups(today);
  const pg = pgroups.find((g) => g.id === sp.pg && g.ownPolicy) ?? null; // 그룹만의 기준을 고른 경우 (L06)
  const [policies, lots, entries, expiring, grants, requests, types, { data: staff }] = await Promise.all([
    pg ? loadGroupPolicies(pg) : loadDefaultPolicies(),
    loadLots(),
    loadEntries(),
    loadExpiring(today),
    loadLeaveGrants(),
    loadLeaveRequests({ practice }),
    loadAllLeaveTypes(),
    createAdminClient().from('profiles').select('id, name, joined_on, active').order('name'),
  ]);
  const nameOf = new Map((staff ?? []).map((p) => [p.id as string, p.name as string]));
  const hiddenSet = new Set(await hiddenTestIds());
  const shown = entriesFor(entries, practice);
  const d = (m: number) => minutesToDays(m);
  const toLine = (l: (typeof lots)[number], rem: Map<string, number>): LotLine => ({
    id: l.id, employeeId: l.employeeId, name: nameOf.get(l.employeeId) ?? '', kind: l.kind, grantedOn: l.grantedOn, usableFrom: l.usableFrom, usableTo: l.usableTo, days: d(l.quantityMinutes),
    remaining: l.state === 'APPROVED' ? d(rem.get(l.id) ?? 0) : null, state: l.state, note: l.note,
    rule: typeof l.basis.rule === 'string' ? l.basis.rule : 'manual', years: typeof l.basis.years === 'number' ? l.basis.years : null, month: typeof l.basis.month === 'number' ? l.basis.month : null,
  });
  const remAll = lotRemaining(lots, shown);
  const balances: BalanceLine[] = (staff ?? [])
    .filter((p) => p.active || lots.some((l) => l.employeeId === p.id))
    .map((p) => {
      const mine = lots.filter((l) => l.employeeId === p.id);
      const b = ledgerBalance(mine, shown.filter((e) => e.employeeId === p.id), today);
      const old = calcLeaveBalance({ grants: grants.filter((g) => g.employeeId === p.id), requests: requests.filter((r) => r.employeeId === p.id), types, asOf: today });
      const started = mine.some((l) => l.state === 'APPROVED');
      return {
        advanceOver: b.advance > Math.round((policies[0]?.policy.advanceMaxDays ?? 0) * 480),
        employeeId: p.id as string, name: p.name as string, joinedOn: (p.joined_on as string | null) ?? null, active: p.active as boolean, started,
        granted: d(b.granted), used: d(b.used), expired: d(b.expired), remaining: d(b.remaining), advance: d(b.advance), upcoming: d(b.upcoming),
        old: old.grant ? old.remaining : null,
      };
    });
  const emp = sp.emp && nameOf.has(sp.emp) ? sp.emp : null;
  const empLots = emp ? lots.filter((l) => l.employeeId === emp).map((l) => toLine(l, remAll)) : [];
  const lotLabel = new Map(lots.map((l) => [l.id, `${l.grantedOn}`]));
  const empEntries: EntryLine[] = emp
    ? shown.filter((e) => e.employeeId === emp).map((e) => ({ id: e.id, event: e.event, days: d(e.minutes), on: e.effectiveOn, lot: e.lotId ? (lotLabel.get(e.lotId) ?? '') : null, fromRequest: e.requestId !== null }))
    : [];
  const p = policies[0] ?? null;
  const settlements = emp ? await loadSettlements(emp) : [];

  return (
    <PageShell wide>
      <ListHead title={t('title')} desc={t('intro')} settingsHref="/admin/settings?tab=leave" settingsLabel={tGear('item.setLeave')} />
      <LedgerBoard
        group={pg ? { id: pg.id, name: pg.name } : null}
        today={today}
        live={sp.live === '1'}
        practice={practice}
        policy={p ? { id: p.id, version: p.version, validFrom: p.validFrom, verification: p.verification, value: p.policy } : null}
        history={policies.slice(1).map((x) => ({ version: x.version, validFrom: x.validFrom, validTo: x.validTo, basis: x.policy.basis, reason: x.reason }))}
        candidates={lots.filter((l) => l.state === 'CANDIDATE').map((l) => toLine(l, remAll))}
        expiring={expiring.map((x) => ({ id: x.lot.id, name: nameOf.get(x.lot.employeeId) ?? '', usableTo: x.lot.usableTo ?? '', days: d(x.minutes), carry: p ? d(splitCarry(x.minutes, p.policy).carry) : 0 }))}
        balances={balances}
        emp={emp ? { id: emp, name: nameOf.get(emp) ?? '', lots: empLots, entries: empEntries, settlements: settlements.map((x) => ({ id: x.id, retireOn: x.retireOn, revision: x.revision, state: x.state, unused: d(x.unusedMinutes), advance: d(x.advanceMinutes), hireBasis: x.snapshot.hireBasisMinutes === null ? null : d(x.snapshot.hireBasisMinutes), granted: d(x.snapshot.grantedMinutes), lots: x.snapshot.lots.map((l) => ({ grantedOn: l.grantedOn, days: d(l.minutes) })) })) } : null}
      />
      {/* 휴가 정책 그룹 — 가끔 바꾸는 설정이라 맨 아래에 접어 둔다 (2026-10-16 디자인) */}
      <Fold title={t('groupsTitle')} summary={pgroups.map((g) => `${g.name} ${g.members.length}`).join(' · ')}>
        <PolicyGroups
          today={today}
          current={pg?.id ?? null}
          groups={pgroups.map((g) => ({ ...g, members: g.members.map((m) => ({ employeeId: m.employeeId, name: nameOf.get(m.employeeId) ?? '', validFrom: m.validFrom })) }))}
          people={(staff ?? []).filter((p) => p.active && !hiddenSet.has(p.id as string)).map((p) => ({ id: p.id as string, name: p.name as string, groupId: pgroups.find((g) => !g.isDefault && g.members.some((m) => m.employeeId === p.id))?.id ?? null }))}
        />
      </Fold>
    </PageShell>
  );
}
