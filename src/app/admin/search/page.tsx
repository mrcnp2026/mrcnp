// 통합 검색 — 관리자 모드 (결과 화면은 components/SearchPage.tsx)
import { SearchPage } from '@/components/SearchPage';

export default function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; more?: string }> }) {
  return <SearchPage base="/admin" searchParams={searchParams} />;
}
