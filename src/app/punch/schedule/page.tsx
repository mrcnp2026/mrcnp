// 직원 「근무일정」 메뉴는 없앴다 (2026-10-15 의뢰인: 직원에게 근무일정은 곧 출퇴근 일정 — 결정 사항 개발-37).
// 옛 주소 · 즐겨찾기를 위해 내 근태현황(주간)으로 보낸다. 일정 요청 양식(/punch/schedule/request)은 그대로 쓴다.
import { redirect } from 'next/navigation';

export default async function MySchedulePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sp = await searchParams;
  redirect(`/punch/records?v=week${sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? `&d=${sp.d}` : ''}`);
}
