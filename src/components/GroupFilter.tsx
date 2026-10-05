'use client';
// 부서·팀으로 걸러 보기 — 고르면 주소(?g=)가 바뀐다 (뒤로 가기·새로 고침에도 같은 묶음). 그룹이 없으면 그리지 않는다.
import { useRouter } from 'next/navigation';

export function GroupFilter({ value, options, allLabel, label, params }: { value: string; options: { id: string; label: string }[]; allLabel: string; label: string; params: Record<string, string | undefined> }) {
  const router = useRouter();
  if (options.length === 0) return null;
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined && k !== 'g' && k !== 'p') q.set(k, v);
        if (e.target.value) q.set('g', e.target.value);
        router.push(`?${q.toString()}`, { scroll: false });
      }}
      className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text md:w-auto"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
