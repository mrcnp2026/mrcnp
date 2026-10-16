'use client';
// PC 공통 표 — 시프티 PC의 목록 표 모양 (2026-10-11 의뢰인 스샷 `스샷/관리-직원.png` 등):
//   머리줄 위에 열마다 검색 칸 · 머리 글자를 누르면 정렬(고른 열은 파란 글자 + 화살표) · 가는 줄 · 위에 「총 N」.
// 줄 자료는 서버가 만들어 넘긴다 — 칸마다 글자(text: 검색·정렬에 쓴다)와 보일 모양(node: 없으면 글자 그대로).
// 폰에서는 쓰지 않는다(부르는 쪽이 lg에서만 보이게 한다).
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

export type PcCol = { key: string; label: string; align?: 'left' | 'right' | 'center'; search?: boolean; sort?: boolean; className?: string };
export type PcRow = { id: string; dim?: boolean; cells: Record<string, { text: string; node?: ReactNode }> };

export function PcTable({ cols, rows, labels, total }: { cols: PcCol[]; rows: PcRow[]; labels: { search: string; empty: string; total?: string }; total?: boolean }) {
  const [find, setFind] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const shown = useMemo(() => {
    const active = Object.entries(find).filter(([, v]) => v.trim());
    let out = rows.filter((r) => active.every(([k, v]) => (r.cells[k]?.text ?? '').toLowerCase().includes(v.trim().toLowerCase())));
    if (sort) out = [...out].sort((a, b) => sort.dir * (a.cells[sort.key]?.text ?? '').localeCompare(b.cells[sort.key]?.text ?? '', undefined, { numeric: true }));
    return out;
  }, [rows, find, sort]);
  const al = (c: PcCol) => (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="flex flex-col gap-2">
      {total && labels.total && (
        <p className="num text-muted">
          {labels.total} <b className="text-lg text-text">{shown.length}</b>
        </p>
      )}
      {/* 화면의 주 목록 표 — 견본 「나 · 파랑」처럼 위에 진한 선 한 줄(공통 목록 틀 ListTable과 같은 모양, 2026-10-16) */}
      <div className="overflow-x-auto border-t border-text bg-bg">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {cols.map((c) => (
                <td key={c.key} className="px-3 pt-3 pb-1">
                  {c.search !== false && (
                    <input
                      type="search"
                      value={find[c.key] ?? ''}
                      onChange={(e) => setFind({ ...find, [c.key]: e.target.value })}
                      placeholder={labels.search}
                      aria-label={`${c.label} ${labels.search}`}
                      className="h-8 w-full max-w-32 min-w-16 rounded-button border border-border bg-surface px-2 text-xs! outline-none placeholder:text-faint focus:border-primary focus:bg-bg"
                    />
                  )}
                </td>
              ))}
            </tr>
            <tr>
              {cols.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined} className={`px-3 py-2 ${al(c)} ${c.className ?? ''}`}>
                    {c.sort === false ? (
                      c.label
                    ) : (
                      <button type="button" onClick={() => setSort(on ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })} className={`inline-flex items-center gap-1 rounded-button px-1 font-semibold ${on ? 'bg-primary-tint text-primary' : ''}`}>
                        {c.label}
                        {on && (sort!.dir === 1 ? <ArrowUp aria-hidden size={14} /> : <ArrowDown aria-hidden size={14} />)}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-faint">
                  {labels.empty}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className={r.dim ? 'opacity-60' : ''}>
                {cols.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${al(c)}`}>
                    {r.cells[c.key]?.node ?? r.cells[c.key]?.text ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
