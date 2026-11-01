// 통합 검색 — 관리자 모드 (결과 화면은 components/SearchPage.tsx)
import { SearchPage } from '@/components/SearchPage';
import { adminPage } from '@/lib/admin-gate';

export default async function AdminSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; more?: string }> }) {
  await adminPage(); // 관리 화면 이중 확인 (lib/admin-gate)
  return <SearchPage base="/admin" searchParams={searchParams} />;
}
