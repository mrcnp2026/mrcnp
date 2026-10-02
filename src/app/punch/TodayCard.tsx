'use client';
// "오늘 근무" 카드 + 주 버튼 1개 (부록 R-10-1).
// - 버튼은 상태에 따라 출근하기(파랑·LogIn 아이콘) ↔ 퇴근하기(검정·LogOut 아이콘). 색 + 글자 + 아이콘 셋으로 구분 (색만 X)
// - 폭 100%·높이 56px (2026-10-02 의뢰인: 96px은 너무 큼), 화면 하단 고정 금지 (12장 5번)
// - 누르면 폰 확인(지문·얼굴·PIN) → 서버가 정한 시각을 큰 숫자로 확인시킨다 (R-10-8 신뢰 장치)
// - 기록 중에는 버튼을 막고 "기록하는 중" — 두 번 눌러도 한 번만 (7-4 요점 1)
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { Check, Clock, LogIn, LogOut } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PUNCHED_EVENT, PUNCHING_EVENT } from '@/components/NoticeSheet';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { LiveClock } from '@/components/LiveClock';
import { Card, Chip } from '@/components/ui';
import type { DayStatus } from '@/lib/today';

type Result = { kind: 'in' | 'out'; punchedAt: string; ipVerified: boolean; isTest: boolean; deduped: boolean };

export function TodayCard(props: {
  schedule: string | null;
  endTime: string | null; // 퇴근 예정 (근무규칙 끝 시각, HH:MM)
  status: DayStatus;
  firstIn: string | null;
  firstInVerified: boolean | null;
  lastOut: string | null;
  isOpen: boolean;
  lateMinutes: number | null;
  practice: boolean;
}) {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const f = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const time = (iso: string) => f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const kind: 'in' | 'out' = props.isOpen ? 'out' : 'in';

  async function punch() {
    setErr(null);
    setResult(null);
    if (!browserSupportsWebAuthn()) return setErr({ code: 'unsupported' });
    setBusy(true);
    window.dispatchEvent(new Event(PUNCHING_EVENT)); // 확인하는 동안 공지 팝업을 미룬다
    try {
      const opts = await callApi<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/punch/options');
      if (!opts.ok) return setErr(opts);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.data }); // 출퇴근마다 폰 확인 (4-11)
      } catch (e) {
        return setErr({ code: passkeyBrowserError(e) });
      }
      // 본문에는 kind와 폰의 서명만 보낸다. 시각·IP·연습 여부는 서버가 정한다 (7-4 요점 4)
      const r = await callApi<Result>('/api/punch', { kind, response });
      if (!r.ok) return setErr(r);
      setResult(r.data);
      router.refresh();
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(PUNCHED_EVENT)); // 성공·실패 모두 — 미뤘던 공지를 이제 띄운다
    }
  }

  // 토스풍 (2026-10-02 의뢰인 선택 시안): 카드에서 가장 먼저 읽힐 숫자 하나를 아주 크게.
  //  출근 전 → 지금 시각 · 근무 중 → 지금까지 일한 시간 · 퇴근 후 → 퇴근 시각
  const state: 'before' | 'working' | 'done' = props.isOpen ? 'working' : props.lastOut ? 'done' : 'before';
  const Icon = kind === 'in' ? LogIn : LogOut;
  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${state === 'working' ? 'text-primary' : 'text-muted'}`}>
            {state === 'before' ? t('nowLabel') : state === 'working' ? t('workingLabel') : t('doneLabel')}
          </p>
          <p className="num mt-1 text-4xl leading-tight font-extrabold tracking-tight">
            {state === 'before' && <LiveClock initial={new Date().toISOString()} />}
            {state === 'working' && props.firstIn && <Elapsed since={props.firstIn} />}
            {state === 'done' && props.lastOut && time(props.lastOut)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {state === 'before' && props.status !== 'off' && <Chip>{t('beforeIn')}</Chip>}
          {props.status === 'off' && <Chip>{t('status.off')}</Chip>}
          {props.lateMinutes !== null && <Chip tone="warn">{t('lateBy', { n: props.lateMinutes })}</Chip>}
          {/* 연습 모드 배지: 연한 파랑 + 파랑 글자 — 주황·초록·빨강 금지 (4-6, R-10-8 규칙 7) */}
          {props.practice && <Chip tone="info">{tc('practiceBadge')}</Chip>}
        </div>
      </div>

      {state !== 'before' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-button bg-surface px-4 py-3">
            <p className="text-xs text-muted">{t('clockInLabel')}</p>
            <p className="num text-xl font-extrabold">{props.firstIn ? time(props.firstIn) : '--:--'}</p>
            {props.firstInVerified === true && (
              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-ok">
                <Check aria-hidden size={14} strokeWidth={2.5} />
                {t('office')}
              </p>
            )}
            {props.firstInVerified === false && <p className="mt-0.5 text-xs font-medium text-warn">{t('outside')}</p>}
          </div>
          <div className="rounded-button bg-surface px-4 py-3">
            <p className="text-xs text-muted">{state === 'working' ? t('plannedOut') : t('clockOutLabel')}</p>
            <p className={`num text-xl font-extrabold ${state === 'working' ? 'text-faint' : ''}`}>
              {state === 'working' ? (props.endTime ?? '--:--') : props.lastOut ? time(props.lastOut) : '--:--'}
            </p>
          </div>
        </div>
      )}
      {state === 'before' && <p className="num -mt-3 text-sm text-muted">{props.schedule ?? t('noRule')}</p>}

      {result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="flex items-center gap-2 rounded-button bg-ok-tint px-4 py-3 font-bold text-ok">
            <Check aria-hidden size={20} strokeWidth={2.5} className="shrink-0" />
            <span className="num">{t(result.kind === 'in' ? 'recordedIn' : 'recordedOut', { time: time(result.punchedAt) })}</span>
          </p>
          {result.deduped && <p className="text-sm text-muted">{t('already')}</p>}
          {!result.ipVerified && <ErrorNote code="outsideOffice" namespace="home" />}
        </div>
      )}

      {/* 출근은 파랑, 퇴근은 거의 검정 — 색 + 글자 + 아이콘 셋으로 구분 (색만 X). 정정 요청은 하단 탭에 있다 */}
      <button
        type="button"
        onClick={punch}
        disabled={busy}
        className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-punch px-4 text-lg font-bold text-on-primary disabled:opacity-60 ${
          kind === 'in' ? 'bg-primary' : 'bg-primary-deep'
        }`}
      >
        {busy ? <Clock aria-hidden size={22} strokeWidth={2} /> : <Icon aria-hidden size={22} strokeWidth={2} />}
        {busy ? t('recording') : t(kind === 'in' ? 'clockIn' : 'clockOut')}
      </button>

      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </Card>
  );
}

/** 근무 중 — 출근부터 지금까지 (1분마다 갱신). 표시만 하고 계산·기록에는 쓰지 않는다 */
function Elapsed({ since }: { since: string }) {
  const t = useTranslations('home');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  return <span suppressHydrationWarning>{t('elapsed', { h: Math.floor(min / 60), m: min % 60 })}</span>;
}
