'use client';
// 추가 창의 두 탭 — 「한 명씩 / 한 건」 · 「엑셀로 여러 …」 (2026-10-20 의뢰인: 엑셀 일괄 입력은 + 추가 창의 탭으로). 직원 추가 · 출퇴근 기록 추가가 같이 쓴다.
import { useState, type ReactNode } from 'react';

export function AddTabs({ one, many, labels }: { one: ReactNode; many: ReactNode; labels: { one: string; many: string; group: string } }) {
  const [tab, setTab] = useState<'one' | 'many'>('one');
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={labels.group} className="grid grid-cols-2 self-start rounded-button border border-border bg-bg p-0.5 text-sm">
        {(['one', 'many'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex min-h-11 items-center justify-center rounded-button px-4 lg:min-h-9 ${tab === k ? 'bg-surface font-bold text-text' : 'text-muted'}`}>
            {labels[k]}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'one'}>{one}</div>
      {tab === 'many' && many}
    </div>
  );
}
