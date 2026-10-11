// PC 목록 위의 「비활성화된 ○○ 보기」 토글 — 시프티 PC 목록의 스위치 (2026-10-11 의뢰인 스샷 `스샷/관리-지점.png` 등).
// 누르면 꺼 둔 것만 보는 목록으로 오간다(주소의 ?tab=off). 폰에서는 「쓰는 / 꺼 둔」 탭이 같은 일을 한다.
import Link from 'next/link';

export function OffToggle({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} role="switch" aria-checked={on} className="inline-flex min-h-8 items-center gap-2 self-start text-sm text-muted">
      <span aria-hidden className={`relative h-5 w-9 shrink-0 rounded-chip transition-colors duration-150 ${on ? 'bg-primary' : 'bg-border'}`}>
        <span className={`absolute top-0.5 left-0.5 size-4 rounded-chip bg-bg transition-transform duration-150 ${on ? 'translate-x-4' : ''}`} />
      </span>
      {label}
    </Link>
  );
}
