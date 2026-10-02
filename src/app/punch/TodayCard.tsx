'use client';
// "오늘 근무" 카드 + 주 버튼 1개 (부록 R-10-1).
// - 버튼은 상태에 따라 출근하기(파랑·LogIn 아이콘) ↔ 퇴근하기(초록·LogOut 아이콘). 색 + 글자 + 아이콘 셋으로 구분 (색만 X)
// - 폭 70%↑·높이 96px↑, 화면 하단 고정 금지 (4-9, 12장 5번)
// - 누르면 폰 확인(지문·얼굴·PIN) → 서버가 정한 시각을 큰 숫자로 확인시킨다 (R-10-8 신뢰 장치)
// - 기록 중에는 버튼을 막고 "기록하는 중" — 두 번 눌러도 한 번만 (7-4 요점 1)
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { CalendarClock, Check, Clock, LogIn, LogOut } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PUNCHED_EVENT } from '@/components/NoticeSheet';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Card, CardTitle, Chip } from '@/components/ui';
import type { DayStatus } from '@/lib/today';

type Result = { kind: 'in' | 'out'; punchedAt: string; ipVerified: boolean; isTest: boolean; deduped: boolean };

const STATUS_TONE: Record<DayStatus, 'neutral' | 'ok' | 'warn' | 'info'> = {
  working: 'info',
  late: 'warn',
  absent: 'neutral',
  done: 'ok',
  overtime: 'warn',
  off: 'neutral',
};

export function TodayCard(props: {
  schedule: string | null;
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
      window.dispatchEvent(new Event(PUNCHED_EVENT)); // 공지 팝업은 이 다음에 뜬다 (②-5 7-15 요점 18)
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const Icon = kind === 'in' ? LogIn : LogOut;
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle
        icon={CalendarClock}
        aside={
          <div className="flex flex-wrap justify-end gap-1">
            <Chip tone={STATUS_TONE[props.status]}>{t(`status.${props.status}`)}</Chip>
            {/* 연습 모드 배지: 연한 파랑 + 파랑 글자 — 주황·초록·빨강 금지 (4-6, R-10-8 규칙 7) */}
            {props.practice && <Chip tone="info">{tc('practiceBadge')}</Chip>}
          </div>
        }
      >
        <span className="flex flex-col">
          <span>{t('today')}</span>
          <span className="num text-sm font-normal whitespace-nowrap text-muted">{props.schedule ?? t('noRule')}</span>
        </span>
      </CardTitle>

      <div className="grid grid-cols-2 gap-2">
        {(['in', 'out'] as const).map((k) => {
          const v = k === 'in' ? props.firstIn : !props.isOpen ? props.lastOut : null;
          return (
            <div key={k} className="rounded-button bg-surface p-3">
              <p className="text-xs text-muted">{t(k === 'in' ? 'clockInLabel' : 'clockOutLabel')}</p>
              <p className={`num text-2xl font-bold ${v ? 'text-text' : 'text-faint'}`}>{v ? time(v) : '--:--'}</p>
            </div>
          );
        })}
      </div>
      {(props.firstInVerified !== null || props.lateMinutes !== null) && (
        <div className="flex flex-wrap items-center gap-2">
          {props.firstInVerified === true && <Chip tone="ok">{t('office')}</Chip>}
          {props.firstInVerified === false && <Chip tone="warn">{t('outside')}</Chip>}
          {props.lateMinutes !== null && <Chip tone="warn">{t('lateBy', { n: props.lateMinutes })}</Chip>}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="flex items-center gap-2 rounded-card border border-ok bg-ok-tint p-3 text-ok">
            <Check aria-hidden size={24} strokeWidth={1.75} className="shrink-0" />
            <span className="num text-2xl font-bold">
              {t(result.kind === 'in' ? 'recordedIn' : 'recordedOut', { time: time(result.punchedAt) })}
            </span>
          </p>
          {result.deduped && <p className="text-sm text-muted">{t('already')}</p>}
          {!result.ipVerified && <ErrorNote code="outsideOffice" namespace="home" />}
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={punch}
          disabled={busy}
          className={`flex min-h-16 w-full items-center justify-center gap-2 rounded-punch px-4 text-xl font-semibold text-on-primary disabled:opacity-60 ${
            kind === 'in' ? 'bg-primary' : 'bg-ok'
          }`}
        >
          {busy ? <Clock aria-hidden size={24} strokeWidth={1.75} /> : <Icon aria-hidden size={24} strokeWidth={1.75} />}
          {busy ? t('recording') : t(kind === 'in' ? 'clockIn' : 'clockOut')}
        </button>
        {/* 정정 요청은 하단 탭에 있으므로 여기 따로 두지 않는다 (2026-10-02 의뢰인) */}
      </div>

      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
    </Card>
  );
}
