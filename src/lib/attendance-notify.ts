// 근태 알림 — 이상자 통보 · 근태 마감 공지 (2026-10-14 다우오피스 비교 문서 08 ⑥-1). 이미 있는 업무 메시지함(work-messages)으로 보낸다 — DB 변경 없음.
//   이상자 통보: 그 달에 아직 처리하지 않은 이상 기록(마감 차단 · 확인 필요)이 있는 직원에게, 날짜와 유형을 적어 한 사람에 한 통.
//   마감 공지: 그 달 근태를 언제 마감하는지, 그 전에 누락 · 정정 요청을 마쳐 달라고 전 직원에게.
// 보낸 기록은 메시지의 related(type · id=달)로 찾는다 — 화면에 「통보함 · 공지함」으로 보인다.
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { summarizeAnomalies } from '@/lib/anomaly';
import { collectAnomalies, loadAnomalyPolicy, loadAnomalyReviews } from '@/lib/anomaly-data';
import type { Me } from '@/lib/auth';
import { monthSpan } from '@/lib/close-review';
import { loadPeriod } from '@/lib/period-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTestNo, sendNotice } from '@/lib/work-messages';

/** 그 달에 아직 처리하지 않은 이상 기록 — 직원마다 날짜와 유형 */
export async function openAnomaliesByEmployee(month: string, practice: boolean): Promise<Map<string, { workDate: string; types: string[] }[]>> {
  const { from, last } = monthSpan(month);
  const [data, saved, reviews] = await Promise.all([loadPeriod(from, last, practice), loadAnomalyPolicy(), loadAnomalyReviews(from, last, practice)]);
  const sum = summarizeAnomalies(collectAnomalies(data, from, last), saved.policy, new Set(reviews.keys()));
  const out = new Map<string, { workDate: string; types: string[] }[]>();
  for (const x of sum.shown) {
    if (!x.block && x.reviewed) continue; // 확인함으로 표시한 것은 보내지 않는다
    out.set(x.employeeId, [...(out.get(x.employeeId) ?? []), { workDate: x.workDate, types: x.types }]);
  }
  return out;
}

/** 이상자 통보 — employeeIds를 주면 그 사람만, 없으면 그 달에 남은 이상 기록이 있는 사람 모두 */
export async function notifyAnomalies(args: { me: Me; month: string; practice: boolean; employeeIds?: string[] }): Promise<{ sent: number }> {
  const t = await getTranslations('admin.anomalies.notify');
  const tt = await getTranslations('admin.anomalies.type');
  const open = await openAnomaliesByEmployee(args.month, args.practice);
  const only = args.employeeIds ? new Set(args.employeeIds) : null;
  let sent = 0;
  for (const [employeeId, items] of open) {
    if (only && !only.has(employeeId)) continue;
    const lines = items.sort((a, b) => a.workDate.localeCompare(b.workDate)).map((i) => `· ${i.workDate} — ${i.types.map((k) => tt(k)).join(', ')}`);
    try {
      await sendNotice({
        me: args.me,
        title: t('title', { month: args.month }),
        body: `${t('body', { month: args.month })}\n\n${lines.join('\n')}\n\n${t('how')}`,
        needsReply: false,
        audience: { employeeIds: [employeeId] },
        related: { type: 'anomaly', id: args.month, href: `/punch/records?m=${args.month}` },
      });
      sent++;
    } catch {
      // 받을 수 없는 사람(꺼진 직원 · 검사 계정과 실제 직원이 섞인 경우)은 건너뛴다
    }
  }
  return { sent };
}

/** 그 달에 보낸 통보 · 공지 — kind: anomaly(직원마다 마지막으로 보낸 때) · closing(보낸 때 · 받은 사람 수) */
export async function loadSentFor(type: 'anomaly' | 'closing', month: string, viewer: Me): Promise<{ at: string; recipients: string[] }[]> {
  const c = createAdminClient();
  const { data } = await c.from('work_messages').select('id, created_at, is_test').eq('kind', 'notice').eq('related->>type', type).eq('related->>id', month).order('created_at', { ascending: false }).limit(200);
  const mine = (data ?? []).filter((m) => (m.is_test as boolean) === isTestNo(viewer.employeeNo));
  if (mine.length === 0) return [];
  const { data: rec } = await c.from('work_message_recipients').select('message_id, employee_id').in('message_id', mine.map((m) => m.id as string));
  return mine.map((m) => ({ at: m.created_at as string, recipients: (rec ?? []).filter((r) => r.message_id === m.id).map((r) => r.employee_id as string) }));
}

/** 근태 마감 공지 — 전 직원에게 「○월 근태를 ○일에 마감합니다」 */
export async function sendClosingNotice(args: { me: Me; month: string; due: string }): Promise<{ recipients: number }> {
  const t = await getTranslations('admin.closing.notice');
  const r = await sendNotice({
    me: args.me,
    title: t('title', { month: args.month }),
    body: t('body', { month: args.month, due: args.due }),
    needsReply: false,
    audience: { all: true },
    related: { type: 'closing', id: args.month, href: `/punch/records?m=${args.month}` },
  });
  return { recipients: r.recipients };
}
