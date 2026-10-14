// 통합 검색 — 직원 모드 (결과 화면은 components/SearchPage.tsx)
import { SearchPage } from '@/components/SearchPage';

export default function MySearchPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; more?: string }> }) {
  return <SearchPage base="/punch" searchParams={searchParams} />;
}
