'use client';
// 메뉴 링크 — 손이 닿는 순간 그 화면을 미리 받아 둔다 (2026-10-29 의뢰인: 「메뉴를 클릭하고 다른 페이지로 전환될 때 반응이 늦고, 불러오는 중이 길다」).
// 마우스를 올리면 · 손가락이 닿으면 · Tab으로 오면 그 화면 전체(자료까지)를 서버에 미리 부탁한다. 보통 누르기 전 0.1~0.3초가 남아,
// 누르는 순간 바로 뜨거나 「불러오는 중」이 짧아진다. 미리 받은 자료는 30초만 쓴다(next.config staleTimes) — 오래된 숫자가 보이지 않게.
// 화면에 보이기만 할 때는 미리 받지 않는다(메뉴가 수십 개라 화면마다 서버를 수십 번 부르게 된다).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';
import { forwardRef, useRef, type ComponentProps } from 'react';

type Props = ComponentProps<typeof Link>;

export const IntentLink = forwardRef<HTMLAnchorElement, Props>(function IntentLink({ onPointerEnter, onFocus, onTouchStart, href, ...rest }, ref) {
  const router = useRouter();
  const done = useRef(0);
  const warm = () => {
    const to = typeof href === 'string' ? href : href.pathname ? `${href.pathname}${href.search ?? ''}` : null;
    if (!to || !to.startsWith('/') || Date.now() - done.current < 25_000) return; // 25초 안에 다시 부탁하지 않는다
    done.current = Date.now();
    router.prefetch(to, { kind: PrefetchKind.FULL });
  };
  return (
    <Link
      ref={ref}
      href={href}
      prefetch={false} // 위 마지막 줄대로 — Link 기본값은 운영에서 화면에 보이는 링크를 모두 미리 받는다(메뉴 수십 개 × 화면마다 서버 호출)
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
});
