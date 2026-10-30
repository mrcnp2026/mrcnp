// 증명서 목록 한 줄씩 — 직원 화면 · 관리자 화면이 같이 쓴다 (2026-10-29 남은 일 9-3). 서버 부품.
import { Download, Eye } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Chip } from '@/components/ui';
import type { CertRow } from '@/lib/certificates';

const TONE = { REQUESTED: 'warn', ISSUED: 'ok', REJECTED: 'neutral' } as const;

export async function CertList({ rows, nameOf, action }: { rows: CertRow[]; nameOf?: (id: string) => string; action?: (r: CertRow) => ReactNode }) {
  const [t, f] = await Promise.all([getTranslations('certificates'), getFormatter()]);
  const at = (iso: string) => f.dateTime(new Date(iso), { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' });
  if (rows.length === 0) return <p className="rounded-card border border-border p-6 text-center text-sm text-faint">{t('empty')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              {nameOf && <b>{nameOf(r.employeeId)}</b>}
              <b className={nameOf ? 'font-normal' : ''}>{t(`kind.${r.kind}`)}</b>
              <Chip tone={TONE[r.state]}>{t(`state.${r.state}`)}</Chip>
            </span>
            <span className="num text-xs text-muted">
              {[r.serial ? t('serialOf', { no: r.serial }) : null, t('purposeOf', { p: r.purpose }), t('copiesOf', { n: r.copies }), at(r.issuedAt ?? r.createdAt)].filter(Boolean).join(' · ')}
            </span>
            {r.rejectReason && <span className="text-xs text-warn">{t('rejectedBecause', { r: r.rejectReason })}</span>}
          </span>
          {/* 발급된 것: 새 탭에서 보기 · 받기 (2026-10-30 의뢰인: 클릭하면 받기만 있었다) */}
          {r.state === 'ISSUED' && (
            <span className="flex gap-2 self-start sm:self-center">
              <a href={`/api/certificates/${r.id}?view=1`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3 font-bold hover:bg-surface">
                <Eye aria-hidden size={16} />
                {t('viewPdf')}
              </a>
              <a href={`/api/certificates/${r.id}`} className="inline-flex h-9 items-center gap-1 rounded-button border border-border bg-bg px-3 font-bold hover:bg-surface">
                <Download aria-hidden size={16} />
                {t('download')}
              </a>
            </span>
          )}
          {action?.(r)}
        </li>
      ))}
    </ul>
  );
}
