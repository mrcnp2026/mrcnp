'use client';
// "오늘 근무" 카드 + 주 버튼 1개 (부록 R-10-1).
// - 버튼은 상태에 따라 출근하기(파랑·LogIn 아이콘) ↔ 퇴근하기(검정·LogOut 아이콘). 색 + 글자 + 아이콘 셋으로 구분 (색만 X)
// - 폭 100%·높이 56px (2026-10-02 의뢰인: 96px은 너무 큼), 화면 하단 고정 금지 (12장 5번)
// - 누르면 바로 기록 → 서버가 정한 시각을 큰 숫자로 확인시킨다 (R-10-8 신뢰 장치). 지문 확인은 묻지 않는다 (2026-10-05 의뢰인)
// - 기록 중에는 버튼을 막고 "기록하는 중" — 두 번 눌러도 한 번만 (7-4 요점 1)
import { Check, Clock, LogIn, LogOut } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PUNCHED_EVENT, PUNCHING_EVENT } from '@/components/NoticeSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { LiveClock } from '@/components/LiveClock';
import { Card, Chip } from '@/components/ui';
import type { DayStatus } from '@/lib/today';

type Result = { kind: 'in' | 'out'; punchedAt: string; ipVerified: boolean; verifiedBy?: 'ip' | 'gps' | null; isTest: boolean; deduped: boolean };

/** 지금 위치 한 번 (최대 8초). 거절·실패·미지원이면 null — 위치 없이도 기록은 남는다 */
function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

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
  const [geoFailed, setGeoFailed] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const time = (iso: string) => f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const kind: 'in' | 'out' = props.isOpen ? 'out' : 'in';

  async function punch() {
    setErr(null);
    setResult(null);
    setBusy(true);
    window.dispatchEvent(new Event(PUNCHING_EVENT)); // 확인하는 동안 공지 팝업을 미룬다
    try {
      const opts = await callApi<{ needLocation?: boolean }>('/api/punch/options');
      if (!opts.ok) return setErr(opts);
      const { needLocation } = opts.data;
      // 사무실 인터넷이 아닐 때만 위치를 묻는다 (GPS로 사무실 확인 — 설정에 사무실 위치가 있을 때)
      const geo = needLocation ? await currentPosition() : null;
      setGeoFailed(!!needLocation && !geo);
      // 본문에는 kind(+ 필요할 때만 위치)만 보낸다. 누구인지·시각·IP·연습 여부·사무실 판정은 서버가 정한다 (7-4 요점 4)
      const r = await callApi<Result>('/api/punch', { kind, ...(geo ? { geo } : {}) });
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
          {result.verifiedBy === 'gps' && <p className="text-sm font-medium text-ok">{t('officeByGps')}</p>}
          {!result.ipVerified && <ErrorNote code={geoFailed ? 'outsideNoLocation' : 'outsideOffice'} namespace="home" />}
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
