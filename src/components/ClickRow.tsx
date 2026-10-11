'use client';
// 표의 한 줄 전체를 누르면 그 줄의 상세로 간다 (2026-10-11 의뢰인: 요청 내역은 요청 종류 이름이 아니라 줄 어디를 눌러도 상세 패널이 열려야 한다).
// 줄 안의 링크 · 버튼을 누른 것은 그쪽 동작에 맡긴다. 글쇠로는 줄 안의 링크로 간다(줄 자체는 탭 순서에 넣지 않는다).
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export function ClickRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label')) return;
        router.push(href, { scroll: false });
      }}
      className="cursor-pointer transition-colors duration-150 hover:bg-primary-tint"
    >
      {children}
    </tr>
  );
}
