'use client';
// "오늘 근무" 카드 + 주 버튼 1개 (부록 R-10-1).
// - 버튼은 상태에 따라 출근하기(파랑·LogIn 아이콘) ↔ 퇴근하기(검정·LogOut 아이콘). 색 + 글자 + 아이콘 셋으로 구분 (색만 X)
// - 폭 100%·높이 56px (2026-10-02 의뢰인: 96px은 너무 큼), 화면 하단 고정 금지 (12장 5번)
// - 누르면 기기 확인(지문·얼굴·PIN) → 서버가 정한 시각을 큰 숫자로 확인시킨다 (R-10-8 신뢰 장치)
// - ★ 출퇴근은 등록한 기기 1대에서만 (2026-10-05 의뢰인): 로그인은 아이디 + 비밀번호로 어디서나 되지만,
//   찍기는 본인이 등록한 폰 + 지문·얼굴이 있어야 한다 — 비밀번호를 알려 줘도 동료 폰으로는 찍히지 않는다.
//   · 등록한 기기가 없으면: 버튼 자리에 "이 기기를 출퇴근 기기로 등록" (본인이 직접, 초대 코드 없음)
//   · 다른 기기에서 열었으면: 버튼 대신 안내 (등록하지 않은 기기에서 지문 창을 띄우면 브라우저가 "보안 키(USB)"를 찾으라고 해서 혼란스럽다)
// - 기록 중에는 버튼을 막고 "기록하는 중" — 두 번 눌러도 한 번만 (7-4 요점 1)
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Check, Clock, Fingerprint, LogIn, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PUNCHED_EVENT, PUNCHING_EVENT } from '@/components/NoticeSheet';
import { callApi, passkeyBrowserError } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { InAppWarning, RegisterTroubleshoot } from '@/components/PasskeyHelp';
import { Card, Chip } from '@/components/ui';

type Result = { requested?: boolean; kind: 'in' | 'out'; punchedAt: string; ipVerified: boolean; verifiedBy?: 'ip' | 'gps' | null; isTest: boolean; deduped: boolean };

// 이 브라우저가 등록에 쓰인 기기인지 기억해 두는 표시 (등록·확인에 성공하면 적는다). 보안 장치가 아니라 안내용이다 —
// 진짜 확인은 서버가 기기의 서명으로 한다. 브라우저 데이터를 지우면 사라지므로 "이 기기가 맞습니다"로 다시 확인할 수 있다.
const DEVICE_MARK = 'punch-device';
function readMark(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_MARK);
  } catch {
    return null;
  }
}
function writeMark(credentialId: string) {
  try {
    window.localStorage.setItem(DEVICE_MARK, credentialId);
  } catch {
    // 저장이 막힌 브라우저 — 다음에 한 번 더 물어볼 뿐이다
  }
}

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
  dateLabel: string; // 10/10 (토)
  planLine: string | null; // 오늘 일정 「08:00 - 17:00」. 없으면 null (무일정)
  hasRule: boolean; // 회사 근무규칙이 있는가 (없으면 안내)
  pendingPunch?: { kind: 'in' | 'out'; at: string } | null; // 승인을 기다리는 반경 밖 출근/퇴근 요청
  firstIn: string | null;
  firstInVerified: boolean | null;
  lastOut: string | null;
  isOpen: boolean;
  lateMinutes: number | null;
  practice: boolean;
  device: { credentialId: string; label: string | null } | null; // 등록한 출퇴근 기기. 없으면 null
  phone: boolean; // 폰·태블릿에서 열었는가 — PC에서는 기기 등록을 받지 않는다 (2026-10-06 의뢰인)
}) {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  const tn = useTranslations('nav');
  const f = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const [device, setDevice] = useState(props.device);
  // 이 브라우저가 등록한 그 기기인가: null=아직 모름(첫 그리기), true/false
  const [thisDevice, setThisDevice] = useState<boolean | null>(null);
  const [justRegistered, setJustRegistered] = useState(false);
  useEffect(() => setDevice(props.device), [props.device]);
  useEffect(() => setThisDevice(device ? readMark() === device.credentialId : null), [device]);

  async function registerDevice() {
    setErr(null);
    if (!browserSupportsWebAuthn()) return setErr({ code: 'unsupported' });
    setBusy(true);
    try {
      const opts = await callApi<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/device/register/options');
      if (!opts.ok) return setErr(opts);
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.data }); // 기기가 화면 잠금(지문·얼굴·PIN)을 묻는다
      } catch (e) {
        const code = passkeyBrowserError(e);
        return setErr({ code: code === 'cancelled' ? 'register_failed' : code });
      }
      const r = await callApi<{ credentialId: string }>('/api/device/register/verify', { response });
      if (!r.ok) return setErr(r);
      writeMark(r.data.credentialId);
      setDevice({ credentialId: r.data.credentialId, label: null });
      setJustRegistered(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const time = (iso: string) => f.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const kind: 'in' | 'out' = props.isOpen ? 'out' : 'in';

  async function punch() {
    setErr(null);
    setResult(null);
    setBusy(true);
    window.dispatchEvent(new Event(PUNCHING_EVENT)); // 확인하는 동안 공지 팝업을 미룬다
    try {
      if (!browserSupportsWebAuthn()) return setErr({ code: 'unsupported' });
      const opts = await callApi<{ needLocation?: boolean; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/api/punch/options');
      if (!opts.ok) {
        if (opts.code === 'device_required') setDevice(null); // 그 사이 관리자가 기기를 해제했다 → 등록 안내로
        return setErr(opts);
      }
      const { needLocation, options } = opts.data;
      // 사무실 인터넷이 아닐 때만 위치를 묻는다 (GPS로 사무실 확인 — 설정에 사무실 위치가 있을 때)
      const geo = needLocation ? await currentPosition() : null;
      setGeoFailed(!!needLocation && !geo);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: options }); // 출퇴근마다 기기 확인 (4-11)
      } catch (e) {
        setThisDevice(false); // 취소했거나 등록한 기기가 아니다 — 브라우저가 둘을 구분해 주지 않는다
        return setErr({ code: passkeyBrowserError(e) });
      }
      // 본문에는 kind와 기기의 서명(+ 필요할 때만 위치)만 보낸다. 누구인지·시각·IP·연습 여부·사무실 판정은 서버가 정한다 (7-4 요점 4)
      const r = await callApi<Result>('/api/punch', { kind, response, ...(geo ? { geo } : {}) });
      if (!r.ok) return setErr(r);
      if (device) writeMark(device.credentialId);
      setThisDevice(true);
      setJustRegistered(false);
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
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight">{t('todayTitle')}</h2>
        <div className="flex flex-wrap justify-end gap-1">
          {props.lateMinutes !== null && <Chip tone="warn">{t('lateBy', { n: props.lateMinutes })}</Chip>}
          {/* 연습 모드 배지: 연한 파랑 + 파랑 글자 — 주황·초록·빨강 금지 (4-6, R-10-8 규칙 7) */}
          {props.practice && <Chip tone="info">{tc('practiceBadge')}</Chip>}
        </div>
      </div>
      {/* 날짜 · 오늘 일정 (없으면 「무일정」) · 찍은 시각 — 왼쪽 색 막대: 근무 중이면 파랑, 아니면 초록 */}
      <div className={`flex flex-col gap-1 border-l-4 pl-4 ${state === 'working' ? 'border-primary' : 'border-ok'}`}>
        <p className="num text-lg">{props.dateLabel}</p>
        <p className="num flex flex-wrap items-center gap-2 text-lg text-muted">
          {props.planLine ?? t('noSchedule')}
          {!props.planLine && <Chip>{t('noScheduleChip')}</Chip>}
        </p>
        {state !== 'before' && (
          <p className="num flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold">
            <span>{t('inAt', { time: props.firstIn ? time(props.firstIn) : '--:--' })}</span>
            {state === 'done' && props.lastOut && <span>{t('outAt', { time: time(props.lastOut) })}</span>}
            {state === 'working' && props.firstIn && (
              <span className="text-primary">
                <Elapsed since={props.firstIn} />
              </span>
            )}
            {props.firstInVerified === true && (
              <span className="flex items-center gap-1 text-xs font-medium text-ok">
                <Check aria-hidden size={14} strokeWidth={2.5} />
                {t('office')}
              </span>
            )}
            {props.firstInVerified === false && <span className="text-xs font-medium text-warn">{t('outside')}</span>}
          </p>
        )}
        {props.pendingPunch && !result && (
          <p className="num flex flex-wrap items-center gap-2 text-sm font-bold text-warn">
            <Clock aria-hidden size={16} strokeWidth={2} />
            {t(props.pendingPunch.kind === 'in' ? 'requestWaitIn' : 'requestWaitOut', { time: time(props.pendingPunch.at) })}
          </p>
        )}
        {!props.hasRule && <p className="text-sm text-faint">{t('noRule')}</p>}
      </div>

      {result?.requested && (
        <div className="flex flex-col gap-1 rounded-button bg-warn-tint px-4 py-3 text-warn" aria-live="polite">
          <p className="num font-bold">{t(result.kind === 'in' ? 'requestedIn' : 'requestedOut', { time: time(result.punchedAt) })}</p>
          <p className="text-sm">{t(geoFailed ? 'requestedNoLocation' : 'requestedExplain')}</p>
        </div>
      )}
      {result && !result.requested && (
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

      {justRegistered && (
        <p className="flex items-center gap-2 rounded-button bg-ok-tint px-4 py-3 text-sm font-bold text-ok" aria-live="polite">
          <Check aria-hidden size={18} strokeWidth={2.5} className="shrink-0" />
          {t('device.registered')}
        </p>
      )}

      {!device && !props.phone ? (
        // PC: 출퇴근 기기가 될 수 없다 → 등록 버튼 없이 안내만
        <div className="flex flex-col gap-2 rounded-button bg-surface p-4">
          <p className="flex items-center gap-2 font-bold">
            <Smartphone aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-primary" />
            {t('device.pcTitle')}
          </p>
          <p className="text-sm text-muted">{t('device.pcExplain')}</p>
        </div>
      ) : !device ? (
        // 등록한 기기가 없다 → 본인이 지금 이 기기를 등록한다 (초대 코드 없음)
        <div className="flex flex-col gap-3 rounded-button bg-surface p-4">
          <p className="flex items-center gap-2 font-bold">
            <Smartphone aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-primary" />
            {t('device.registerTitle')}
          </p>
          <p className="text-sm text-muted">{t('device.registerExplain')}</p>
          <InAppWarning />
          <button type="button" data-device-register onClick={registerDevice} disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-punch bg-primary px-4 text-base font-bold text-on-primary disabled:opacity-60">
            <Fingerprint aria-hidden size={22} strokeWidth={1.75} />
            {busy ? tc('working') : t('device.registerButton')}
          </button>
          <p className="flex gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            {t('device.privacy')}
          </p>
        </div>
      ) : thisDevice === false ? (
        // 등록한 기기가 따로 있다 → 여기서는 찍지 못한다고 먼저 알린다
        <div className="flex flex-col gap-2 rounded-button bg-warn-tint p-4 text-warn">
          <p className="flex items-center gap-2 font-bold">
            <Smartphone aria-hidden size={20} strokeWidth={1.75} className="shrink-0" />
            {t('device.otherTitle')}
          </p>
          <p className="text-sm">{device.label ? t('device.otherExplainLabel', { label: device.label }) : t('device.otherExplain')}</p>
          <button type="button" onClick={() => { setErr(null); setThisDevice(true); }} className="min-h-11 self-start text-sm font-semibold underline">
            {t('device.otherRetry')}
          </button>
        </div>
      ) : (
        // 출근은 파랑, 퇴근은 거의 검정 — 색 + 글자 + 아이콘 셋으로 구분 (색만 X).
        // 왼쪽 「요청」 = 내 요청 화면 (+ 버튼에서 종류를 고른다) (2026-10-10 의뢰인: 시프티처럼 출근 버튼 옆에)
        <div className="flex gap-2">
        <Link href="/punch/requests" className="flex min-h-14 shrink-0 items-center justify-center rounded-punch border-2 border-border bg-bg px-6 text-base font-bold text-text">
          {tn('requests')}
        </Link>
        <button
          type="button"
          onClick={punch}
          disabled={busy || thisDevice === null}
          className={`flex min-h-14 flex-1 items-center justify-center gap-2 rounded-punch px-4 text-lg font-bold text-on-primary disabled:opacity-60 ${
            kind === 'in' ? 'bg-primary' : 'bg-primary-deep'
          }`}
        >
          {busy ? <Clock aria-hidden size={22} strokeWidth={2} /> : <Icon aria-hidden size={22} strokeWidth={2} />}
          {busy ? t('recording') : t(kind === 'in' ? 'clockIn' : 'clockOut')}
        </button>
        </div>
      )}

      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="home" />}
      {err && !device && ['register_failed', 'unsupported', 'verification_failed', 'user_verification_missing'].includes(err.code) && <RegisterTroubleshoot />}
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
