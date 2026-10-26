// 도움말 — 관리자 모드 (관리자는 직원 가이드도 함께 본다, 지점관리자는 직원 가이드만). 화면은 components/HelpCenter.
import { notFound } from 'next/navigation';
import { HelpCenter } from '@/components/HelpCenter';
import { getMe } from '@/lib/auth';

export default async function AdminHelpPage({ searchParams }: { searchParams: Promise<{ a?: string; v?: string; q?: string }> }) {
  const me = await getMe();
  if (!me || me.role === 'employee') notFound();
  return <HelpCenter base="/admin" isAdmin={me.role === 'admin'} searchParams={searchParams} />;
}
