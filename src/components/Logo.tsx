// 회사 로고. 가로형(글자 포함)과 마크(육각형)만 있다. 크기는 높이로 정한다.
// 가로형은 통합설정 › 회사 기본설정에서 바꾼 로고를 쓴다(/api/brand/logo — 올린 것이 없으면 원래 파일, 2026-10-18 의뢰인). 마크는 고정.
import Image from 'next/image';
import { BRAND } from '@/config/brand';

export function Logo({ height = 28, variant = 'full', priority = false, className = 'shrink-0' }: { height?: number; variant?: 'full' | 'mark'; priority?: boolean; className?: string }) {
  if (variant === 'full') {
    // 올린 로고는 가로세로 비율을 미리 모른다 — 높이만 정하고 너비는 그림에 맡긴다
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/api/brand/logo" alt={BRAND.name} style={{ height, width: 'auto', maxWidth: height * 6 }} fetchPriority={priority ? 'high' : undefined} className={`object-contain ${className}`} />;
  }
  const img = BRAND.mark;
  const width = Math.round((img.width / img.height) * height);
  return <Image src={img.src} alt={BRAND.name} width={width} height={height} priority={priority} className={className} />;
}
