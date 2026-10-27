// 통합 검색 — 메뉴 · 직원 · 요청 · 휴가 · 공지 · 업무 메시지 · 급여를 한 번에 찾는다 (2026-10-14 의뢰인: 다우오피스 위쪽 검색, 미구현 목록 48번). 서버 전용.
// ★ 권한: 직원은 자기 것 · 자기에게 온 것만, 지점관리자는 맡은 지점 직원 것만, 급여는 급여 담당 관리자만(직원은 공개된 자기 명세서만).
//   검사 계정(e2e-) 자료는 실제 관리자에게 나오지 않는다(hiddenTestIds — 보는 사람에 따라).
import 'server-only';
import { getLocale, getTranslations } from 'next-intl/server';
import { OFFICE } from '@/config/office';
import { appsFor, type NavRole } from '@/config/nav';
import { isSystemAdminNo } from '@/lib/system-admin';
import type { Me } from '@/lib/auth';
import { leaveTypeName } from '@/lib/leave';
import { loadAllLeaveTypes } from '@/lib/leave-data';
import { listNoticesForAdmin, visibleNoticesFor } from '@/lib/notices';
import { groupPath } from '@/lib/org';
import { loadOrgGroups } from '@/lib/org-data';
import { loadMySlips } from '@/lib/payroll/publish-data';
import { loadRuns } from '@/lib/payroll/run-data';
import { hiddenTestIds } from '@/lib/period-data';
import { loadRequests } from '@/lib/request-data';
import { viewerScope } from '@/lib/scope';
import { matchLevel, snippet, sortHits, SEARCH_KINDS, type SearchHit, type SearchKind } from '@/lib/search';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadInbox, loadSent } from '@/lib/work-messages';

export type SearchResult = { q: string; hits: SearchHit[]; counts: Record<SearchKind, { exact: number; related: number }> };
const MAX_Q = 50;

export async function runSearch(me: Me, rawQ: string): Promise<SearchResult> {
  const q = rawQ.trim().slice(0, MAX_Q);
  const empty = Object.fromEntries(SEARCH_KINDS.map((k) => [k, { exact: 0, related: 0 }])) as SearchResult['counts'];
  if (!q) return { q, hits: [], counts: empty };
  const role: NavRole = me.role === 'admin' ? 'admin' : me.role === 'manager' ? 'manager' : 'employee';
  const staff = role !== 'employee';
  const [t, tf, tl, locale] = await Promise.all([getTranslations('search'), getTranslations('frame'), getTranslations('leave'), getLocale()]);
  const db = createAdminClient();
  const [hidden, scope, groups, people, types] = await Promise.all([hiddenTestIds(), viewerScope(), loadOrgGroups(), db.from('profiles').select('id, name, employee_no, job_title, group_id, active'), loadAllLeaveTypes()]);
  const hide = new Set(hidden);
  const visible = (id: string) => !hide.has(id) && (!scope || scope.has(id));
  const nameOf = new Map((people.data ?? []).map((p) => [p.id as string, p.name as string]));
  const hits: SearchHit[] = [];
  const add = (kind: SearchKind, fields: (string | null | undefined)[], hit: Omit<SearchHit, 'kind' | 'level'>) => {
    const level = matchLevel(q, fields);
    if (level) hits.push({ kind, level, ...hit });
  };

  // ── 메뉴 (내가 열 수 있는 공간만) ──
  for (const space of (['my', 'admin', 'console'] as const).filter((s) => s === 'my' || (s === 'admin' && staff) || (s === 'console' && role === 'admin'))) {
    for (const app of appsFor(space, role, isSystemAdminNo(me.employeeNo))) {
      const appName = tf(space === 'console' ? `app.${app.key}` : `appFull.${app.key}`);
      for (const g of app.groups) {
        const groupName = g.key ? tf(`group.${g.key}`) : '';
        for (const leaf of g.items) {
          const title = tf(`item.${leaf.key}`);
          // 화면 이름에 들어 있으면 정확히 일치, 화면 이름엔 없어도 묶음 · 앱 이름에 들어 있으면 관련 결과
          // (2026-10-22 의뢰인: 「조직」으로 찾아도 조직도 · 「직원 · 조직」 안의 화면이 다 나오게)
          const level = matchLevel(q, [title]) ?? (matchLevel(q, [appName, groupName]) ? 'related' : null);
          if (level) hits.push({ kind: 'menu', level, title, where: `${tf(`space.${space}`)} › ${appName}${groupName ? ` › ${groupName}` : ''}`, href: leaf.href });
        }
      }
    }
  }

  // ── 직원 (이름 · 사번 · 직책 · 소속). 직원도 조직도처럼 이름 · 직책 · 소속까지만 ──
  for (const p of people.data ?? []) {
    const id = p.id as string;
    if (!p.active || !visible(id)) continue;
    const where = [groupPath(groups, p.group_id as string | null), p.job_title as string | null].filter(Boolean).join(' · ');
    add('people', [p.name as string, staff ? (p.employee_no as string | null) : null, p.job_title as string | null, where], { title: p.name as string, where: where || t('noGroup'), href: role === 'manager' ? `/admin/records/${id}` : staff ? `/admin/members/${id}` : `/punch/org?q=${encodeURIComponent(p.name as string)}` });
  }

  // ── 요청 (대기 + 최근 두 달). 직원은 내 것만 ──
  const reqs = (await loadRequests(staff ? {} : { employeeId: me.id })).filter((r) => staff ? visible(r.employeeId) : true);
  for (const r of reqs) {
    const who = nameOf.get(r.employeeId) ?? '';
    const kindName = t(`req.${r.kind}`);
    const sub = r.kind === 'leave' && r.sub ? leaveTypeName(types, r.sub, tl) : null;
    const title = `${staff ? `${who} · ` : ''}${kindName}${sub ? ` · ${sub}` : ''}`;
    const href = staff ? `/admin/inbox?k=${r.kind === 'correction' ? 'corrections' : r.kind}&id=${r.id}` : r.status === 'pending' ? '/punch/requests' : '/punch/requests?tab=done';
    add('requests', [who, kindName, sub, r.reason, r.place, r.date], { title, where: `${t(`status.${r.status}`)} · ${r.date}${r.endDate !== r.date ? ` ~ ${r.endDate}` : ''}`, body: r.reason ?? undefined, date: r.createdAt?.slice(0, 10) ?? null, href });
  }

  // ── 휴가 (승인된 것 — 최근 1년). 직원은 내 것만 ──
  {
    const since = new Date(Date.now() - 366 * 86_400_000).toISOString().slice(0, 10);
    let lq = db.from('leave_requests').select('id, employee_id, type_code, start_date, end_date, days, reason, status').eq('is_test', OFFICE.practiceMode).eq('status', 'approved').gte('end_date', since).order('start_date', { ascending: false }).limit(1000);
    if (!staff) lq = lq.eq('employee_id', me.id);
    const { data } = await lq;
    for (const l of data ?? []) {
      const id = l.employee_id as string;
      if (staff && !visible(id)) continue;
      const who = nameOf.get(id) ?? '';
      const type = leaveTypeName(types, l.type_code as string, tl);
      add('leave', [who, type, l.reason as string | null, l.start_date as string], { title: `${staff ? `${who} · ` : ''}${type} ${t('days', { n: Number(l.days) })}`, where: `${l.start_date}${l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}`, body: (l.reason as string | null) ?? undefined, date: l.start_date as string, href: staff ? `/admin/leave/req/${l.id}` : `/punch/leave` });
    }
  }

  // ── 공지 (관리자: 전부 · 그 밖: 나에게 게시된 것) ──
  if (role === 'admin') {
    for (const n of await listNoticesForAdmin(new Date())) {
      add('notices', [n.notice.title, n.notice.body], { title: n.notice.title, where: t(`notice.${n.state}`), body: snippet(n.notice.body, q), date: n.notice.startsAt.toISOString().slice(0, 10), href: `/admin/notices/${n.notice.id}` });
    }
  } else {
    for (const n of await visibleNoticesFor(me.id, locale, new Date())) {
      add('notices', [n.display.title, n.display.body, n.original.title, n.original.body], { title: n.display.title, where: n.confirmed ? t('notice.confirmed') : t('notice.unconfirmed'), body: snippet(n.display.body, q), date: n.startsAt.toISOString().slice(0, 10), href: '/punch/notices' });
    }
  }

  // ── 업무 메시지 (받은 것 + 보낸 것). 본문도 찾는다 ──
  {
    const lines = [...(await loadInbox(me, 300)), ...(await loadSent(me, 300))].filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);
    const { data: bodies } = lines.length ? await db.from('work_messages').select('id, body').in('id', lines.map((m) => m.id)) : { data: [] as { id: string; body: string }[] };
    const bodyOf = new Map((bodies ?? []).map((b) => [b.id as string, (b.body as string) ?? '']));
    const base = staff && me.role === 'admin' ? '/admin/messages' : '/punch/messages';
    for (const m of lines) {
      const sender = m.senderId ? (nameOf.get(m.senderId) ?? '') : t('system');
      add('messages', [m.title, bodyOf.get(m.id), sender], { title: m.title, where: `${m.mine ? t('msg.sent') : t('msg.received')} · ${sender}`, body: snippet(bodyOf.get(m.id) ?? '', q), date: m.createdAt.slice(0, 10), href: `${base}/${m.id}` });
    }
  }

  // ── 급여 (급여 담당 관리자: 대장 · 그 밖: 공개된 내 명세서) ──
  if (me.role === 'admin' && me.canViewPayroll) {
    for (const r of await loadRuns(OFFICE.practiceMode)) {
      const month = r.periodFrom.slice(0, 7);
      const title = r.title || t('pay.run', { month, kind: t(`pay.kind.${r.kind}`) });
      add('pay', [title, month, t(`pay.kind.${r.kind}`), t('pay.ledger')], { title, where: `${t('pay.ledger')} · ${t(`pay.status.${r.status}`)}`, date: r.periodFrom, href: `/admin/payroll/runs/${r.id}` });
    }
  }
  for (const s of await loadMySlips(me.id, OFFICE.practiceMode)) {
    const title = t('pay.slip', { month: s.month });
    add('pay', [title, s.month, t('pay.mine')], { title, where: `${t('pay.mine')} · ${s.payDate}`, date: s.payDate, href: `/punch/payslips?y=${s.month.slice(0, 4)}&s=${s.id}` });
  }

  hits.sort(sortHits);
  const counts = empty;
  for (const h of hits) counts[h.kind][h.level]++;
  return { q, hits, counts };
}
