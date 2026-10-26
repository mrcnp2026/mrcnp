// 문의하기 — 내 화면(직원 모드). 로그인한 누구나. 화면은 components/InquiryCenter.
import { notFound } from 'next/navigation';
import { InquiryCenter } from '@/components/InquiryCenter';
import { getMe } from '@/lib/auth';

export default async function PunchInquiryPage({ searchParams }: { searchParams: Promise<{ t?: string; s?: string }> }) {
  const me = await getMe();
  if (!me) notFound();
  return <InquiryCenter base="/punch" me={me} searchParams={searchParams} />;
}
