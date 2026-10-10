// 공통 목록 틀 — 요청·출퇴근기록·휴가가 같은 모양의 한 줄 목록을 쓴다 (2026-10-10 의뢰인: 시프티처럼 화면마다 같은 틀).
// 흰 상자 하나 안에 줄을 가는 선으로 나눈다. 한 줄 = 왼쪽(날짜·시각) · 가운데(제목 + 덧붙임) · 오른쪽(값·상태).
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import type { ReactNode } from 'react';

export function RowList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-border rounded-card bg-bg empty:hidden ${className}`}>{children}</ul>;
}

export function Row({ lead, children, aside }: { lead?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      {lead && <div className="num w-16 shrink-0 text-sm leading-snug font-semibold">{lead}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      {aside && <div className="flex shrink-0 flex-col items-end gap-1">{aside}</div>}
    </li>
  );
}
