// 진단 화면 (마스터 9-6, 7-3 요점 2, 부록 R-6) — "사무실인데 검증 실패"일 때 추측하지 말고 서버가 실제로 본 값을 본다.
// x-forwarded-for 체인 전체 + 판정에 쓴 주소 + 등록 대역 + 매칭 결과 + 최근 사무실 밖 비율.
// 여기서는 아무것도 저장하지 않는다. 대역 추가는 ② 설정 화면(그 전에는 열쇠 파일 OFFICE_CIDRS)에서 — 교체가 아니라 추가 (9-5).
import { getFormatter, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { Card, Chip, PageShell } from '@/components/ui';
import { OFFICE } from '@/config/office';
import { officeCidrs } from '@/lib/attendance-data';
import { createAdminClient } from '@/lib/supabase/admin';
import { isOfficeIp, parseCidr, traceClientIp } from '@/lib/verify-location';

async function outsideRate(sinceHours: number) {
  const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
  const db = createAdminClient();
  const base = () =>
    db.from('punch_events').select('id', { count: 'exact', head: true }).eq('kind', 'in').eq('is_test', OFFICE.practiceMode).gte('punched_at', since);
  const [{ count: total }, { count: outside }] = await Promise.all([base(), base().eq('ip_verified', false)]);
  return { total: total ?? 0, n: outside ?? 0 };
}

export default async function DiagPage() {
  const t = await getTranslations('admin.diag');
  const f = await getFormatter();
  const trace = traceClientIp(await headers(), OFFICE.ipHeaderOrder);
  const ranges = await officeCidrs();
  const valid = ranges.filter((r) => parseCidr(r.cidr)).map((r) => r.cidr);
  const match = isOfficeIp(trace.ip, valid);
  const [r24, r7] = await Promise.all([outsideRate(24), outsideRate(24 * 7)]);
  const kind = trace.ip ? (trace.ip.includes(':') ? 'IPv6' : 'IPv4') : null;

  return (
    <PageShell>
      <header>
        <h1 className="text-2xl font-semibold text-primary-deep">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </header>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('thisDevice')}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t('ip')}</dt>
          <dd className="num break-all font-semibold">{trace.ip ?? t('none')}</dd>
          <dt className="text-muted">{t('kind')}</dt>
          <dd>{kind ?? t('none')}</dd>
          <dt className="text-muted">{t('header')}</dt>
          <dd className="num break-all">{trace.usedHeader ?? t('none')}</dd>
          <dt className="text-muted">{t('match')}</dt>
          <dd>{match ? <Chip tone="ok">{t('yes')}</Chip> : <Chip tone="warn">{t('no')}</Chip>}</dd>
        </dl>
        <h3 className="mt-2 text-sm font-semibold">{t('headers')}</h3>
        <ul className="flex flex-col gap-1 text-xs">
          {Object.entries(trace.headers).map(([h, v]) => (
            <li key={h} className="num break-all rounded-button bg-surface p-2">
              <span className="text-muted">{h}: </span>
              {v ?? t('none')}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('ranges')}</h2>
        {ranges.length === 0 ? (
          <p className="text-sm text-warn">{t('noRanges')}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {ranges.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="num break-all font-semibold">{r.cidr}</span>
                <Chip>{r.from === 'db' ? t('fromDb') : t('fromEnv')}</Chip>
                {r.label && <span className="text-muted">{r.label}</span>}
                {!parseCidr(r.cidr) && <Chip tone="warn">{t('invalid')}</Chip>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-1 text-sm">
        <h2 className="font-semibold">{t('rule')}</h2>
        <p className="num">{OFFICE.ipHeaderOrder.join(' → ')}</p>
        <p className="text-muted">
          {OFFICE.ipRuleMeasuredOn ? t('measured', { date: OFFICE.ipRuleMeasuredOn }) : t('notMeasured')}
        </p>
      </Card>

      <Card className="flex flex-col gap-1 text-sm">
        <h2 className="font-semibold">{t('rate')}</h2>
        <p className="num">{t('rate24', { n: f.number(r24.n), total: f.number(r24.total) })}</p>
        <p className="num">{t('rate7', { n: f.number(r7.n), total: f.number(r7.total) })}</p>
        <p className="text-muted">{t('rateHint')}</p>
        {OFFICE.practiceMode && <p className="text-xs text-faint">{t('practiceNote')}</p>}
      </Card>
    </PageShell>
  );
}
