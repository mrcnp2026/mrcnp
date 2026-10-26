// 조직도 도형 (2026-10-06 의뢰인: PC에서는 조직도가 도형으로 / 2026-10-25 3단계까지) — 회사 › 맨 위 조직 › 하위 조직을 상자와 선으로 그린다. 보기 전용.
// 넓은 화면(또는 인쇄)에서만 보인다 — 폰은 가로로 넘치므로 아래 목록(GroupManager)만 쓴다 (가로 스크롤 금지, 4-9).
// 고치기(추가·이름 바꾸기·삭제)는 아래 목록에서 한다.
import type { TreeRow } from './GroupManager';

import { FitOnPrint } from './FitOnPrint';

const box = 'flex min-w-28 flex-col items-center rounded-button px-4 py-3 text-center';
const TONE = ['bg-primary text-on-primary', 'bg-primary-tint text-text', 'bg-surface text-text'] as const; // 1 · 2 · 3단계

function Branch({ n, i, of, depth, countLabel }: { n: TreeRow; i: number; of: number; depth: number; countLabel: (n: number) => string }) {
  return (
    <li className="relative flex flex-col items-center px-2 pt-6">
      {/* 형제들을 잇는 가로선 — 첫째는 오른쪽 절반, 마지막은 왼쪽 절반만 */}
      {of > 1 && <span aria-hidden className={`absolute top-0 h-px bg-border ${i === 0 ? 'right-0 left-1/2' : i === of - 1 ? 'right-1/2 left-0' : 'inset-x-0'}`} />}
      <span aria-hidden className="absolute top-0 left-1/2 h-6 w-px bg-border" />
      <div className={`${box} ${TONE[Math.min(depth, 3) - 1]}`}>
        <span className={depth === 1 ? 'font-bold' : 'font-medium'}>{n.name}</span>
        <span className={`num text-xs ${depth === 1 ? '' : 'text-muted'}`}>{countLabel(n.total)}</span>
      </div>
      {n.children.length > 0 && (
        <>
          <span aria-hidden className="h-4 w-px bg-border" />
          <ul className="flex items-start">
            {n.children.map((c, k) => (
              <Branch key={c.id} n={c} i={k} of={n.children.length} depth={depth + 1} countLabel={countLabel} />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function OrgDiagram({ root, tree, countLabel }: { root: string; tree: TreeRow[]; countLabel: (n: number) => string }) {
  if (tree.length === 0) return null;
  return (
    <div className="hidden overflow-x-auto rounded-card bg-bg p-6 lg:block print:block print:overflow-visible print:p-0 [-webkit-print-color-adjust:exact] [print-color-adjust:exact]">
      <FitOnPrint className="mx-auto flex w-max flex-col items-center print:break-inside-avoid">
        <div className={`${box} bg-primary-deep text-on-primary`}>
          <span className="font-bold">{root}</span>
        </div>
        <span aria-hidden className="h-6 w-px bg-border" />
        <ul className="flex items-start">
          {tree.map((d, i) => (
            <Branch key={d.id} n={d} i={i} of={tree.length} depth={1} countLabel={countLabel} />
          ))}
        </ul>
      </FitOnPrint>
    </div>
  );
}
