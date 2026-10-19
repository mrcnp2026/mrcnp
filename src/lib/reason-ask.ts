// 출근 · 퇴근을 찍은 뒤 사유를 물을지 정한다 (2026-10-18 의뢰인 — 화면은 app/punch/ReasonSheet.tsx)
export type ReasonKind = 'late' | 'outside' | 'holiday' | 'noPlan' | 'overtime' | 'night';
export type ReasonAsk = { kind: 'in' | 'out'; reasons: ReasonKind[]; lateMin: number; overMin: number };

/** 찍은 결과로 무엇을 물을지 — 시각은 서울 기준 'HH:MM'. 물을 것이 없으면 null */
export function reasonAsk(args: {
  kind: 'in' | 'out';
  punchedAt: string;
  outside: boolean;
  planStart: string | null;
  planEnd: string | null;
  graceMin: number;
  offDay: boolean;
  overtimeGraceMin: number;
}): ReasonAsk | null {
  const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const at = new Date(args.punchedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  const now = min(at);
  const reasons: ReasonKind[] = [];
  let lateMin = 0;
  let overMin = 0;
  if (args.kind === 'in') {
    if (args.planStart && now > min(args.planStart) + args.graceMin) {
      lateMin = now - min(args.planStart);
      reasons.push('late');
    }
    if (args.outside) reasons.push('outside');
  } else {
    if (args.offDay) reasons.push('holiday');
    else if (!args.planEnd) reasons.push('noPlan');
    else if (now > min(args.planEnd) + args.overtimeGraceMin) {
      overMin = now - min(args.planEnd);
      reasons.push('overtime');
    }
    if (now >= 22 * 60 || now < 6 * 60) reasons.push('night');
    if (args.outside) reasons.push('outside');
  }
  return reasons.length ? { kind: args.kind, reasons, lateMin, overMin } : null;
}
