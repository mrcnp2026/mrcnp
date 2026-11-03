'use client';
// 지각 처리 (2026-11-03 의뢰인: 「10:53 출근을 확인했어 — 그럼 그다음은 뭘 하라는 건데?」).
// 지각인 날 바로 아래에서 네 가지 중 하나를 고르면 그 자리에서 끝난다 — 처리한 날은 이상 기록에서 빠지고 근태 마감 숫자도 줄어든다.
//   무급으로     : 늦은 시간만큼 「무급 지각/외출 NH」 휴가를 일정 시작부터 넣는다(직권 휴가 · 연차 안 깎음)
//   연차에서 빼기 : 같은 시간만큼 시간 연차를 넣는다(연차 차감)
//   출근 시각 고치기: 실제로는 제시간에 일했다 — 찍힌 출근 시각을 정정한다(최고관리자 · 사유는 정정 창에서)
//   지각 아님     : 외근 · 회의 등 정당한 사유만 남기고 확인완료 — 시간 · 급여는 그대로
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { DirectFix } from './DirectFix';

type Opt = 'unpaid' | 'annual' | 'fix' | 'excuse';
type LeaveOpt = { code: string; name: string; hours: number } | null;

export function LateResolve({ employeeId, workDate, lateMinutes, startTime, unpaid, annual, inEvent, live, confirmedHref }: {
  employeeId: string;
  workDate: string;
  lateMinutes: number;
  startTime: string; // 그날 일정 시작 'HH:MM' — 휴가를 여기서부터 넣는다
  unpaid: LeaveOpt; // 늦은 시간에 맞는 무급 지각 휴가(없으면 null)
  annual: LeaveOpt; // 늦은 시간에 맞는 시간 연차(없으면 null)
  inEvent: { id: string; time: string } | null; // 고칠 출근 기록 — 최고관리자에게만
  live: boolean;
  confirmedHref: string | null; // 확정된 날이면 그날 상세 주소 — 기록 · 휴가를 바꾸려면 확정부터 풀어야 한다
}) {
  const t = useTranslations('admin.lateResolve');
  const router = useRouter();
  const [opt, setOpt] = useState<Opt | null>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  // 확정된 날은 기록 · 휴가를 바꿀 수 없다(DB가 막는다) — 사유만 남기는 것은 된다
  const opts: Opt[] = confirmedHref ? ['excuse'] : [...(unpaid ? ['unpaid' as const] : []), ...(annual ? ['annual' as const] : []), ...(inEvent ? ['fix' as const] : []), 'excuse'];
  const leave = opt === 'unpaid' ? unpaid : opt === 'annual' ? annual : null;
  const end = (h: number) => {
    const [hh, mm] = startTime.split(':').map(Number);
    const m = hh * 60 + mm + Math.round(h * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  async function run() {
    setBusy(true);
    setErr(null);
    const r = leave
      ? await callApi('/api/admin/leave/direct', { employeeId, typeCode: leave.code, startDate: workDate, endDate: workDate, startTime, reason: t(opt === 'unpaid' ? 'reasonUnpaid' : 'reasonAnnual'), adminReason: why.trim() || t(opt === 'unpaid' ? 'reasonUnpaid' : 'reasonAnnual') })
      : await callApi('/api/admin/anomalies', { action: 'review', employeeId, workDate, types: ['late'], note: why.trim(), live });
    setBusy(false);
    if (!r.ok) return setErr(r);
    setOpt(null);
    setWhy('');
    router.refresh();
  }

  return (
    // 노란 상자 대신 가는 윗선 + 점 하나 — 색은 「지각」 신호에만 (2026-11-03 의뢰인: 확인 상자가 촌스럽다)
    <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-text"><span aria-hidden className="size-1.5 rounded-full bg-warn" />{t('title', { n: lateMinutes })}</p>
      {confirmedHref && (
        <p className="text-sm text-muted">
          {t('confirmedNote')}{' '}
          <Link href={confirmedHref} className="font-bold text-primary underline">{t('confirmedGo')}</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={opt === o}
            onClick={() => { setOpt(opt === o ? null : o); setErr(null); }}
            className={`min-h-10 rounded-chip border px-3.5 text-sm font-medium transition-colors lg:min-h-8 ${opt === o ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg text-text hover:border-primary/40 hover:bg-surface'}`}
          >
            {t(`opt.${o}`, { h: (o === 'unpaid' ? unpaid?.hours : annual?.hours) ?? 0 })}
          </button>
        ))}
      </div>
      {opt && (
        <div className="flex flex-col gap-2 rounded-button bg-surface/60 p-3">
          <p className="text-sm text-muted">
            {leave ? t('leaveWill', { name: leave.name, from: startTime, to: end(leave.hours) }) : opt === 'fix' ? t('fixWill') : t('excuseWill')}
          </p>
          {opt === 'fix' && inEvent ? (
            <DirectFix eventId={inEvent.id} label={t('fixLabel', { time: inEvent.time })} time={inEvent.time} canNextDay={false} />
          ) : (
            <>
              <input
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                maxLength={200}
                placeholder={t(opt === 'excuse' ? 'excusePh' : 'reasonPh')}
                aria-label={t('reasonLabel')}
                className="min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base lg:min-h-9 lg:text-sm"
              />
              <Button type="button" disabled={busy || (opt === 'excuse' && why.trim().length < 2)} onClick={run}>
                {t(`do.${opt}`)}
              </Button>
            </>
          )}
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.lateResolve" />}
        </div>
      )}
    </div>
  );
}
