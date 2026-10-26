// 통합설정 화면 부품 (2026-10-14 문서 07 6장 · 결정 사항 개발-24, 견본 `09 디자인 기준 견본` 「통합설정」):
//   SettingBox   — 둥근 테두리 상자 하나(설정 묶음 전체)
//   SettingGroup — 상자 안 묶음 제목(굵은 18px). 회색 띠를 쓰지 않는다
//   SettingRow   — 한 줄: 왼쪽 이름(굵게) + 설명(회색) / 오른쪽 값 · 조작. 내용이 길면(표 · 양식) wide로 아래에 펼친다
//   UseMark      — 켜짐/꺼짐을 딱지(색 + 글자)로. 바꿀 수 없는 설정도 같은 모양으로 지금 상태를 보인다
// 문장은 여기 쓰지 않는다 — 부르는 쪽이 번역 파일에서 읽어 넘긴다.
import { Check, Minus } from 'lucide-react';
import { SHEET_ICONS } from './SheetOpener';
import Link from 'next/link';
import { HelpTip } from './Help';
import type { ReactNode } from 'react';

export function SettingBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-border bg-bg px-4 lg:px-8 ${className}`}>{children}</section>;
}

export function SettingGroup({ children }: { children: ReactNode }) {
  return <h2 className="pt-6 pb-1 text-lg font-bold first:pt-5">{children}</h2>;
}

export function SettingRow({ label, desc, children, wide = false }: { label: ReactNode; desc?: ReactNode; children?: ReactNode; wide?: boolean }) {
  // PC(2026-10-22 의뢰인, 다우오피스 통합설정 「설정 줄 카드」): 한 줄에 [이름 | 회색 설명 | 오른쪽 값 · 스위치]. 설명을 숨기지 않고 바로 읽힌다.
  // 폰: 예전처럼 이름 옆 ? 말풍선 (2026-10-14 의뢰인: 좁은 화면에 긴 글을 늘어놓지 말 것)
  return (
    <div className={`flex gap-3 border-b border-border py-5 last:border-b-0 ${wide ? 'flex-col' : 'flex-col lg:flex-row lg:items-center lg:gap-6'}`}>
      <div className={`flex min-w-0 flex-1 gap-0.5 ${wide ? 'flex-col lg:gap-1' : 'items-center lg:items-start lg:gap-6'}`}>
        <div className={`flex items-center gap-0.5 ${wide ? '' : 'lg:w-56 lg:shrink-0'}`}>
          <p className="text-base font-semibold lg:text-lg">{label}</p>
          {desc && (
            <span className="lg:hidden">
              <HelpTip>{desc}</HelpTip>
            </span>
          )}
        </div>
        {desc && <p className="hidden min-w-0 flex-1 text-sm leading-6 text-faint lg:block lg:pt-0.5">{desc}</p>}
      </div>
      {children !== undefined && <div className={`flex min-w-0 flex-col gap-2 text-sm ${wide ? '' : 'lg:max-w-md lg:shrink-0 lg:items-end lg:text-right'}`}>{children}</div>}
    </div>
  );
}

export function UseMark({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex h-6 w-fit items-center gap-1 rounded-button px-2 text-xs font-bold whitespace-nowrap ${on ? 'bg-ok-tint text-ok' : 'bg-surface text-muted'}`}>
      {on ? <Check aria-hidden size={14} strokeWidth={2.5} /> : <Minus aria-hidden size={14} strokeWidth={2.5} />}
      {label}
    </span>
  );
}

/**
 * 목록 + 수정 2칸 (PC) — 상세 화면 왼쪽에 같은 종류의 목록을 두어, 목록으로 돌아가지 않고 옆 항목으로 옮겨 다닌다.
 * 폰에서는 왼쪽 칸 없이 본문만(예전과 같다). 꺼 둔 항목은 지금 보고 있는 것만 보인다.
 */
// sub: 목록 항목 밑 한 줄 설명 (2026-10-22, 다우오피스 통합설정 「목록 + 수정」처럼 — 이름만으로 구분이 안 되는 것: 주소 · 시간 · 묶음)
// action: 목록 위 「+ 추가」 (2026-10-22)
export function TwoPane({ title, items, current, children, action, showOff = false }: { showOff?: boolean; title: string; items: { href: string; label: string; sub?: string | null; off?: boolean }[]; current: string; children: ReactNode; action?: { href: string; label: string; id?: string } }) {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <nav aria-label={title} className="hidden overflow-hidden rounded-card border border-border bg-bg lg:block">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-muted">{title}</p>
          {action && (
            <Link href={action.href} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-button px-2.5 text-sm font-semibold text-primary hover:bg-primary-tint">
              {(() => {
                const I = (action.id && SHEET_ICONS[action.id]) || Check;
                return <I aria-hidden size={16} />;
              })()}
              {action.label}
            </Link>
          )}
        </div>
        <ul className="max-h-[calc(100dvh-12rem)] overflow-y-auto py-1">
          {items
            .filter((x) => showOff || !x.off || x.href === current)
            .map((x) => {
              const on = x.href === current;
              return (
                <li key={x.href}>
                  <Link href={x.href} aria-current={on ? 'page' : undefined} className={`mx-1.5 flex min-h-9 flex-col justify-center rounded-button px-2.5 py-1.5 text-sm ${on ? 'bg-primary-tint font-bold text-primary' : 'text-text hover:bg-surface'} ${x.off ? 'opacity-60' : ''}`}>
                    <span className="truncate">{x.label}</span>
                    {x.sub && <span className="truncate text-xs font-normal text-faint">{x.sub}</span>}
                  </Link>
                </li>
              );
            })}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4">{children}</div>
    </div>
  );
}
