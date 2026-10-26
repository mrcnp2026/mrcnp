'use client';
// 고르면 주소의 값 하나(?name=)가 바뀌는 고르기 칸 — [적용] 단추 없이 바로 바뀐다. 주소에 남아서 뒤로 가기 · 새로 고침에도 같은 화면.
import { Select } from '@/components/Select';
import { useRouter } from 'next/navigation';

export function ParamSelect({ name, value, options, label, params, className = '' }: { name: string; value: string; options: { value: string; label: string }[]; label: string; params: Record<string, string | undefined>; className?: string }) {
  const router = useRouter();
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && k !== name) q.set(k, v);
        if (e.target.value) q.set(name, e.target.value);
        router.push(`?${q.toString()}`, { scroll: false });
      }}
      className={`min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text lg:min-h-9 lg:w-auto lg:text-sm ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
