// 급여명세서 메일의 발송 여부 표시와 발송 기록 (2026-10-19 의뢰인). 올린 명세서 화면과 급여대장 화면이 같이 쓴다.
import { getFormatter, getTranslations } from 'next-intl/server';
import { Chip } from '@/components/ui';
import type { SlipMail } from '@/lib/payroll/slip-mail';

const when = (f: Awaited<ReturnType<typeof getFormatter>>, at: string) => f.dateTime(new Date(at), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' });

/** 한 명세서의 발송 여부 — 마지막 기록 기준. 보낸 적이 없고 이메일도 없으면 미리 알려 준다 */
export async function MailStatus({ last, hasEmail }: { last: SlipMail | undefined; hasEmail: boolean }) {
  const [t, f] = await Promise.all([getTranslations('admin.slipMail'), getFormatter()]);
  if (!last) return hasEmail ? <Chip>{t('statusNone')}</Chip> : <Chip tone="warn">{t('statusNoEmail')}</Chip>;
  if (last.result === 'SENT') return <Chip tone="ok">{t('statusSent', { at: when(f, last.at) })}</Chip>;
  if (last.result === 'FAILED') return <Chip tone="warn">{t('statusFailed')}</Chip>;
  return <Chip tone="warn">{t('statusNoEmail')}</Chip>;
}

/** 발송 기록 — 접힌 채 한 줄, 펴면 새것부터 (때 · 받는 사람 · 주소 · 결과 · 보낸 사람) */
export async function MailLog({ mails, names }: { mails: SlipMail[]; names: Map<string, string> }) {
  const [t, f] = await Promise.all([getTranslations('admin.slipMail'), getFormatter()]);
  if (mails.length === 0) return null;
  return (
    <details className="text-sm" data-slip-mail-log>
      <summary className="flex min-h-11 cursor-pointer items-center text-muted">{t('logTitle', { n: mails.length })}</summary>
      <ul className="flex flex-col divide-y divide-border pb-2">
        {mails.map((m) => (
          <li key={m.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
            <span className="num text-muted">{when(f, m.at)}</span>
            <span className="font-semibold">{names.get(m.employeeId) ?? ''}</span>
            {m.revision > 1 && <span className="text-muted">{t('rev', { n: m.revision })}</span>}
            <span className="min-w-0 break-all text-muted">{m.toEmail ?? ''}</span>
            <span className={m.result === 'SENT' ? 'text-ok' : 'text-warn'}>
              {t(`result_${m.result}`)}
              {m.errorCode ? ` (${m.errorCode})` : ''}
            </span>
            <span className="text-faint">{t('by', { name: names.get(m.sentBy) ?? '' })}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
