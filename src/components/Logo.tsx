// 회사 로고. 가로형(글자 포함)과 마크(육각형)만 있다. 크기는 높이로 정한다.
import Image from 'next/image';
import { BRAND } from '@/config/brand';

export function Logo({ height = 28, variant = 'full', priority = false }: { height?: number; variant?: 'full' | 'mark'; priority?: boolean }) {
  const img = variant === 'full' ? BRAND.logo : BRAND.mark;
  const width = Math.round((img.width / img.height) * height);
  return <Image src={img.src} alt={BRAND.name} width={width} height={height} priority={priority} className="shrink-0" />;
}
