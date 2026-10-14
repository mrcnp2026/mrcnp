// 목록 화면 틀 (2026-10-14 문서 08 6장 3 · 결정 사항 개발-24, 견본 `09 디자인 기준 견본` 「관리자 화면(이상자 관리)」):
//   ListHead    — 제목 + ⚙(이 화면의 기준이 있는 통합설정으로 바로가기) + 한 줄 설명 + 오른쪽 단추
//   FilterBar   — 날짜 이동 · 거르기 · 바로가기 한 줄
//   StatusCards — 상태 카드 묶음. 카드를 누르면 그 상태로 걸러지고, 다시 누르면 풀린다(주소로 — 뒤로 가기 · 새로 고침에도 그대로)
//   ListTable   — 표: 머리는 작은 회색 글자 + 위 진한 선, 줄은 가로선만 · 높이 48px
// 이상자 관리 · 요청함 · 연차 촉진 · 급여대장 목록 · 사회보험 · 퇴직급여 · 일용직이 같은 틀을 쓴다. 문장은 부르는 쪽이 번역 파일에서 넘긴다.
import { Settings, TriangleAlert } from 'lucide-react';
import { HelpTip } from './Help';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

export function ListHead({ title, desc, settingsHref, settingsLabel, actions }: { title: string; desc?: ReactNode; settingsHref?: string; settingsLabel?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="flex flex-wrap items-center gap-x-1 text-2xl font-bold">
          {title}
          {desc && <HelpTip>{desc}</HelpTip>}
          {settingsHref && (
            <Link href={settingsHref} aria-label={settingsLabel} title={settingsLabel} className="flex size-8 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-primary">
              <Settings aria-hidden size={18} strokeWidth={1.75} />
            </Link>
          )}
        </h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export type StatusCard = { key: string; label: string; n: number; unit?: string; href: string; on: boolean; tone?: 'warn' | 'ok' | 'muted' };
const TONE = { warn: 'text-warn', ok: 'text-ok', muted: 'text-muted' } as const;

/** 상태 카드 묶음들 — 묶음마다 옅은 회색 상자 안에 흰 카드 */
export function StatusCards({ groups }: { groups: { title: string; cards: StatusCard[] }[] }) {
  return (
    // 묶음 폭은 카드 수에 비례(최대 5칸) — 카드가 적은 묶음이 눌려 이름이 잘리지 않게
    <div className="grid gap-3 lg:grid-cols-(--cols)" style={{ '--cols': groups.map((g) => `minmax(0,${Math.min(Math.max(g.cards.length, 1), 5)}fr)`).join(' ') } as CSSProperties}>
      {groups.map((g) => (
        <section key={g.title} className="rounded-card bg-surface p-3">
          <h2 className="px-1 pb-2 text-sm font-bold text-muted">{g.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
            {g.cards.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                scroll={false}
                aria-pressed={c.on}
                className={`flex flex-col gap-1.5 rounded-button border bg-bg px-3.5 py-3 ${c.on ? 'border-primary ring-2 ring-primary-tint' : 'border-transparent hover:border-border'}`}
              >
                <span className="truncate text-sm text-muted">{c.label}</span>
                <span className={`num text-2xl leading-none font-bold ${c.n > 0 && c.tone ? TONE[c.tone] : c.n === 0 ? 'text-faint' : 'text-text'}`}>
                  {c.n}
                  {c.unit && <small className="pl-0.5 text-sm font-medium text-muted">{c.unit}</small>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 표 — 비었으면 empty 한 줄 */
export function ListTable({ head, children, empty, count }: { head: { label: string; right?: boolean }[]; children: ReactNode; empty?: string; count?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {count && <p className="text-sm text-muted">{count}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-text">
              {head.map((h, i) => (
                <th key={i} scope="col" className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-faint ${h.right ? 'text-right' : 'text-left'}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:h-12 [&_td]:px-3">
            {children}
            {empty && (
              <tr>
                <td colSpan={head.length} className="py-10 text-center text-faint">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 제목 옆 ⚙ — 이 화면의 기준이 있는 통합설정으로 (관리자에게만 보이게 부르는 쪽이 정한다) */
export function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-button text-faint hover:bg-surface hover:text-primary">
      <Settings aria-hidden size={18} strokeWidth={1.75} />
    </Link>
  );
}

/**
 * 꼭 알아야 할 경고 — ⚠ 짧은 한 줄만 보이고, 자세한 내용은 옆 ?를 눌러 본다 (2026-10-14 의뢰인: 긴 글을 바로 늘어놓지 말 것)
 */
export function WarnLine({ short, children }: { short: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 self-start rounded-button bg-warn-tint py-0.5 pr-1 pl-3 text-sm font-semibold text-warn">
      <TriangleAlert aria-hidden size={16} strokeWidth={2} className="shrink-0" />
      {short}
      <HelpTip>{children}</HelpTip>
    </p>
  );
}

export type Step = { key: string; label: string; href?: string; state: 'done' | 'now' | 'todo'; note?: string };
/**
 * 순서 안내 — ① → ② → ③ (2026-10-14 의뢰인: 「무엇을 어디에 넣고, 무엇과 어떻게 이어지는지」가 화면에 보여야 한다)
 * 끝낸 단계는 ✓, 지금 단계는 진하게, 남은 단계는 옅게. 누르면 그 단계 화면으로
 */
export function Steps({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <nav aria-label={label} className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={`num flex size-6 shrink-0 items-center justify-center rounded-chip text-xs font-bold ${s.state === 'done' ? 'bg-ok text-on-primary' : s.state === 'now' ? 'bg-primary text-on-primary' : 'bg-surface text-faint'}`}>{s.state === 'done' ? '✓' : i + 1}</span>
              <span className="flex flex-col leading-tight">
                <span className={`text-sm whitespace-nowrap ${s.state === 'now' ? 'font-bold text-text' : s.state === 'done' ? 'text-muted' : 'text-faint'}`}>{s.label}</span>
                {s.note && <span className="text-xs whitespace-nowrap text-faint">{s.note}</span>}
              </span>
            </>
          );
          const cls = `flex items-center gap-2 rounded-button px-2.5 py-1.5 ${s.state === 'now' ? 'bg-primary-tint' : ''}`;
          return (
            <li key={s.key} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className="text-faint">›</span>}
              {s.href && s.state !== 'now' ? (
                <Link href={s.href} className={`${cls} hover:bg-surface`}>
                  {body}
                </Link>
              ) : (
                <span aria-current={s.state === 'now' ? 'step' : undefined} className={cls}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
