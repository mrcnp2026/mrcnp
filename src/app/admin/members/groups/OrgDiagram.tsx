// 조직도 도형 (2026-10-06 의뢰인: PC에서는 조직도가 도형으로) — 회사 › 부서 › 팀을 상자와 선으로 그린다. 보기 전용.
// 넓은 화면에서만 보인다 — 폰은 가로로 넘치므로 아래 목록(GroupManager)만 쓴다 (가로 스크롤 금지, 4-9).
// 고치기(추가·이름 바꾸기·숨기기)는 아래 목록에서 한다.
import type { DeptRow } from './GroupManager';

const box = 'flex min-w-32 flex-col items-center rounded-button px-4 py-3 text-center';

export function OrgDiagram({ root, depts, countLabel }: { root: string; depts: DeptRow[]; countLabel: (n: number) => string }) {
  if (depts.length === 0) return null;
  return (
    <div className="hidden overflow-x-auto rounded-card bg-bg p-6 lg:block">
      <div className="mx-auto flex w-max flex-col items-center">
        <div className={`${box} bg-primary-deep text-on-primary`}>
          <span className="font-bold">{root}</span>
        </div>
        <span aria-hidden className="h-6 w-px bg-border" />
        <ul className="flex items-start">
          {depts.map((d, i) => (
            <li key={d.id} className="relative flex flex-col items-center px-3 pt-6">
              {/* 부서들을 잇는 가로선 — 첫 부서는 오른쪽 절반, 마지막 부서는 왼쪽 절반만 */}
              {depts.length > 1 && <span aria-hidden className={`absolute top-0 h-px bg-border ${i === 0 ? 'right-0 left-1/2' : i === depts.length - 1 ? 'right-1/2 left-0' : 'inset-x-0'}`} />}
              <span aria-hidden className="absolute top-0 left-1/2 h-6 w-px bg-border" />
              <div className={`${box} bg-primary text-on-primary`}>
                <span className="font-bold">{d.name}</span>
                <span className="num text-xs">{countLabel(d.total)}</span>
              </div>
              {d.teams.map((x) => (
                <div key={x.id} className="flex flex-col items-center">
                  <span aria-hidden className="h-4 w-px bg-border" />
                  <div className={`${box} bg-primary-tint text-text`}>
                    <span className="font-medium">{x.name}</span>
                    <span className="num text-xs text-muted">{countLabel(x.count)}</span>
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
