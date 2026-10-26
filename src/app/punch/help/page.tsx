// 도움말 — 내 화면(직원 모드). 관리자가 내 화면에서 열어도 관리자 가이드까지 함께 본다. 화면은 components/HelpCenter.
import { notFound } from 'next/navigation';
import { HelpCenter } from '@/components/HelpCenter';
import { getMe } from '@/lib/auth';

export default async function PunchHelpPage({ searchParams }: { searchParams: Promise<{ a?: string; v?: string; q?: string }> }) {
  const me = await getMe();
  if (!me) notFound();
  return <HelpCenter base="/punch" isAdmin={me.role === 'admin'} searchParams={searchParams} />;
}
