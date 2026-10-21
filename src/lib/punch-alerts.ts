// 출퇴근 폰 알림의 판단 (2026-10-15 담당자 미팅 · 2026-10-16 의뢰인) — 무엇을 누구에게 보낼지만 정한다. 순수함수, 보내기는 lib/push-events.ts.
//   ① 직원 본인: 오늘 근무 시작 + 30분이 지나도 출근 기록이 없으면 「출근 기록이 없습니다」
//   ② 직원 본인: 퇴근 시각 + 2시간이 지나도 퇴근 기록이 없으면 「퇴근 기록이 없습니다」 (잔업 중일 수 있어 2시간 — 화면의 퇴근 미기록과 같은 기준)
//   ③ 직원 본인: 아침에 어제 빠진 출근 · 퇴근이 있으면 「정정 요청을 해 주세요」 — 누르면 정정 요청이 그 날짜 · 종류로 채워져 열린다 (2026-10-21)
//   ④ 승인할 관리자: 오늘 미출근 — 근무 시작 + 1시간이 지나도 출근 기록이 없는 사람을 관리자마다 「오늘 미출근 n명」 한 통으로 묶어서 (2026-10-21 의뢰인, 알림-13).
//      그 뒤 2시간 안에만 보낸다(저녁에 「미출근」이 가지 않게). 사람은 한 번만 — 다음 확인에서 새로 생긴 사람만 다시 묶는다(members)
//   ⑤ 승인할 관리자: 아침에 「어제 출퇴근 미기록 n명」 한 번 (사람마다 묶어서)
// 같은 알림은 key로 한 번만(push_sent). 직원 알림은 밤(22시~7시)에는 보내지 않는다. 관리자 아침 묶음은 8시부터.
import type { MissingPunch } from '@/lib/missing-punch';
import type { PushPayload } from '@/lib/push';

export type PersonMisses = { id: string; name: string; startTime: string; endTime: string; misses: MissingPunch[] };
/** members가 있으면 묶음 알림 — 보내는 쪽이 사람마다 key로 한 번만 거른 뒤 남은 사람으로 build해서 보낸다 */
export type PlannedAlert = { key: string; to: string[]; payload: PushPayload; members?: { key: string; name: string }[]; build?: (names: string[]) => PushPayload };

export const ABSENT_AFTER_MIN = 60; // 관리자 미출근 묶음: 근무 시작 + 이 분 (알림-13)
export const ABSENT_UNTIL_MIN = ABSENT_AFTER_MIN + 120; // 이 분이 지나면 보내지 않는다 — 놓친 사람은 다음 날 아침 「어제 미기록」으로

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const names = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(', ')} 외 ${xs.length - max}명` : xs.join(', '));
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** minute = 한국 시각의 하루 중 분(0~1439). 안 주면 hour 정각으로 본다 */
export function planPunchAlerts(args: { people: PersonMisses[]; today: string; yesterday: string; hour: number; minute?: number; approversOf: (employeeId: string) => string[] }): PlannedAlert[] {
  const { today, yesterday, hour } = args;
  const now = args.minute ?? hour * 60;
  const out: PlannedAlert[] = [];
  const quiet = hour < 7 || hour >= 22;
  const absent = new Map<string, { key: string; name: string }[]>(); // 관리자 → 오늘 미출근 묶음
  const summary = new Map<string, { in: string[]; out: string[] }>(); // 관리자 → 어제 빠진 사람들
  for (const p of args.people) {
    const todayIn = p.misses.find((m) => m.workDate === today && m.kind === 'in');
    const todayOut = p.misses.find((m) => m.workDate === today && m.kind === 'out');
    const prev = p.misses.filter((m) => m.workDate === yesterday);
    if (todayIn) {
      if (!quiet) out.push({ key: `self-in:${p.id}:${today}`, to: [p.id], payload: { title: '출근 기록이 없습니다', body: `오늘 근무 시작 ${p.startTime} — 출근하셨다면 지금 출근을 눌러 주세요.`, url: '/punch', tag: `self-in-${today}` } });
      const since = now - toMin(p.startTime);
      if (since >= ABSENT_AFTER_MIN && since < ABSENT_UNTIL_MIN) {
        for (const a of args.approversOf(p.id)) absent.set(a, [...(absent.get(a) ?? []), { key: `absent:${p.id}:${today}:${a}`, name: p.name }]);
      }
    }
    if (todayOut && !quiet) {
      out.push({ key: `self-out:${p.id}:${today}`, to: [p.id], payload: { title: '퇴근 기록이 없습니다', body: `오늘 퇴근 시각 ${p.endTime}이 지났습니다. 퇴근하셨다면 퇴근을 눌러 주세요(잔업 중이면 그대로 두세요).`, url: '/punch', tag: `self-out-${today}` } });
    }
    if (prev.length > 0) {
      const what = prev.map((m) => (m.kind === 'in' ? '출근' : '퇴근')).join(' · ');
      const pending = prev.every((m) => m.hasPendingRequest);
      if (!quiet && !pending) out.push({ key: `self-prev:${p.id}:${yesterday}`, to: [p.id], payload: { title: `어제(${md(yesterday)}) ${what} 기록이 빠졌습니다`, body: '정정 요청으로 실제 시각을 알려 주세요.', url: `/punch/corrections?date=${yesterday}&kind=${prev[0].kind}`, tag: `self-prev-${yesterday}` } });
      for (const a of args.approversOf(p.id)) {
        if (!summary.has(a)) summary.set(a, { in: [], out: [] });
        const s = summary.get(a)!;
        if (prev.some((m) => m.kind === 'in')) s.in.push(p.name);
        if (prev.some((m) => m.kind === 'out')) s.out.push(p.name);
      }
    }
  }
  for (const [a, members] of absent) {
    const build = (ns: string[]): PushPayload => ({ title: `오늘 미출근 ${ns.length}명`, body: `${names(ns)} — 근무 시작 1시간이 지나도 출근 기록이 없습니다`, url: '/admin', tag: `absent-${today}` });
    out.push({ key: `absent-bundle:${a}:${today}`, to: [a], payload: build(members.map((m) => m.name)), members, build });
  }
  if (hour >= 8 && hour < 22) {
    for (const [a, s] of summary) {
      const n = new Set([...s.in, ...s.out]).size;
      const body = [s.in.length ? `출근 미기록 ${s.in.length}명: ${names(s.in)}` : '', s.out.length ? `퇴근 미기록 ${s.out.length}명: ${names(s.out)}` : ''].filter(Boolean).join(' · ');
      out.push({ key: `daily:${a}:${yesterday}`, to: [a], payload: { title: `어제(${md(yesterday)}) 출퇴근 미기록 ${n}명`, body, url: `/admin/missing?from=${yesterday}&to=${yesterday}&tab=${s.in.length ? 'in' : 'out'}`, tag: `daily-${yesterday}` } });
    }
  }
  return out.filter((x) => x.to.length > 0);
}
