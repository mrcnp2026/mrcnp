'use client';
// 직원 목록(PC 표)의 「권한」 칸 — 지금 등급을 보여 주고, 바꾸는 곳(직원 상세 「권한 등급」)으로 보낸다.
// 2026-10-15: 등급을 바꾸는 길을 상세 한 곳으로 모았다(목록 · 상세에서 따로 바꾸던 것을 하나로 — 문제 R16, 결정 사항 개발-39).
//   최고관리자 · 대표자의 등급은 최고관리자 · 대표자만 바꾼다 — 아니면 「바꾸기」를 보이지 않는다(서버도 막는다).
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Chip } from '@/components/ui';

export function RoleCell({
  employeeId,
  role,
  canViewPayroll,
  self,
  waiting,
  level = null,
  actorTop = false,
}: {
  employeeId: string;
  role: string;
  canViewPayroll: boolean;
  self: boolean;
  waiting: boolean; // 권한 변경이 다른 관리자의 확인을 기다리는 중
  actorCanPayroll?: boolean;
  level?: 'super' | 'ceo' | 'general' | null;
  actorTop?: boolean;
}) {
  const t = useTranslations('admin.members');
  const tm = useTranslations('admin.manage');
  // 대표자(ceo)는 최고관리자로 보인다 (2026-10-15 의뢰인: 등급 두 가지)
  const lv = role === 'admin' ? (level ?? 'general') : role === 'manager' ? 'manager' : 'employee';
  const grade = lv === 'ceo' ? 'super' : lv;
  const top = grade === 'super';
  return (
    <span className="flex flex-wrap items-center gap-1">
      {grade === 'employee' ? <span className="text-muted">{tm('grade.employee')}</span> : <Chip tone="info">{tm(`grade.${grade}`)}</Chip>}
      {canViewPayroll && <Chip tone="info">{t('payrollChip')}</Chip>}
      {waiting && <Chip tone="warn">{t('roleWaiting')}</Chip>}
      {!self && !waiting && (!top || actorTop) && (
        <Link href={`/admin/members/${employeeId}#manage`} className="inline-flex min-h-8 items-center rounded-button border border-border px-2.5 text-xs font-semibold text-text hover:bg-surface">
          {t('roleChange')} ›
        </Link>
      )}
    </span>
  );
}
