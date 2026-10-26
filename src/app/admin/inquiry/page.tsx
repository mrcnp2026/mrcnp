// 문의하기 — 관리자 모드. 관리자 · 지점관리자는 보낼 수 있고, 최고관리자 · 시스템관리자는 받은 문의에 답한다. 화면은 components/InquiryCenter.
import { notFound } from 'next/navigation';
import { InquiryCenter } from '@/components/InquiryCenter';
import { getMe } from '@/lib/auth';

export default async function AdminInquiryPage({ searchParams }: { searchParams: Promise<{ t?: string; s?: string }> }) {
  const me = await getMe();
  if (!me || me.role === 'employee') notFound();
  return <InquiryCenter base="/admin" me={me} searchParams={searchParams} />;
}
