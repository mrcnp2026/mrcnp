'use client';
// 입력하는 동안 바로 찾는 검색 칸 (2026-10-22 의뢰인: 「텍스트를 입력하면 자동으로 비슷한 단어가 검색돼야 — 조직으로 찾아도 조직 · 조직도가 나오게」).
// 멈추고 0.3초 뒤에 주소의 q만 바꾼다(router.replace) → 서버가 같은 검색(lib/search: 부분 일치 · 낱말 일부 · 초성)으로 결과를 다시 그린다.
// 한글을 조합하는 중(ㅈ → 조 → 조직)에도 기다렸다가 찾는다. 엔터 · 찾기 단추는 예전처럼 form으로.
import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

export function LiveSearchInput({ initial, placeholder }: { initial: string; placeholder: string }) {
  const router = useRouter();
  const path = usePathname();
  const query = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const go = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(query.toString());
      const q = v.trim();
      if (q) p.set('q', q);
      else p.delete('q');
      if (q === (query.get('q') ?? '')) return;
      start(() => router.replace(p.size ? `${path}?${p.toString()}` : path, { scroll: false }));
    }, 300);
  };
  return (
    <label className="flex h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-button border border-border bg-bg px-3 focus-within:border-primary sm:basis-auto sm:max-w-md lg:h-10">
      <Search aria-hidden size={16} className={pending ? 'text-primary' : 'text-faint'} />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          go(e.target.value);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={50}
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-base outline-none lg:text-sm"
      />
    </label>
  );
}
