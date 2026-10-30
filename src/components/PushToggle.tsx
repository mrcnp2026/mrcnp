'use client';
// 폰 알림 받기 켜기 · 끄기 (웹 푸시, 2026-10-16 의뢰인: 휴가 신청 · 미출근자 · 정정 요청을 관리자 폰으로, 직원은 자기 출근 · 퇴근을 잊었을 때). 메뉴 아래에 한 줄.
// 켜기: 알림 허용 창 → 이 기기의 받는 주소를 서버(/api/me/push)에 저장. 끄기: 주소를 지운다.
// 아이폰은 홈 화면에 추가한 앱으로 열었을 때만 알림을 받을 수 있다(애플 정책) — 그 전에는 안내만 보인다.
import { Bell, BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useInstall } from './useInstall';

type State = 'loading' | 'unsupported' | 'ios-home' | 'denied' | 'off' | 'on';

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function send(method: 'POST' | 'DELETE' | 'PUT', body?: unknown): Promise<{ ok: boolean; code?: string; sent?: number }> {
  try {
    const res = await fetch('/api/me/push', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string; sent?: number };
    return res.ok ? { ok: true, sent: json.sent } : { ok: false, code: json.error };
  } catch {
    return { ok: false, code: 'network' };
  }
}

// mode='prompt': 직원 · 지점관리자 폰 홈의 한 줄 안내 — 알림이 꺼져 있으면 켤 때까지 계속 보인다(닫기 없음).
//   2026-10-30 의뢰인: 최고관리자 · 시스템관리자 말고는 반드시 받는다 — 끄는 단추가 없고, 이미 허용한 폰이면 묻지 않고 다시 켠다.
// mode='menu': 최고관리자 · 시스템관리자의 메뉴 한 줄 — 켜기 · 끄기 스위치. 시험 보내기는 시스템관리자만(canTest)
export function PushToggle({ mode = 'menu', audience = 'staff', bare = false, canTest = false }: { mode?: 'menu' | 'prompt'; audience?: 'staff' | 'employee'; bare?: boolean; canTest?: boolean } = {}) {
  const t = useTranslations('push');
  const { state: install } = useInstall();
  const [state, setState] = useState<State>('loading');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!install) return;
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) return setState(install.platform === 'ios' && !install.installed ? 'ios-home' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (!sub && mode === 'prompt' && KEY && Notification.permission === 'granted') return turnOn().then(() => setState((s) => (s === 'loading' ? 'off' : s))); // 허용해 둔 폰은 조용히 다시 켠다
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [install]); // eslint-disable-line react-hooks/exhaustive-deps

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      if (!KEY) return setNote(t('notReady'));
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }));
      const r = await send('POST', { ...sub.toJSON(), device: navigator.userAgent.slice(0, 200) });
      if (!r.ok) {
        await sub.unsubscribe().catch(() => {});
        return setNote(r.code === 'push_not_configured' ? t('notReady') : t('failed'));
      }
      setState('on');
    } catch {
      setNote(t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await send('DELETE', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const r = await send('PUT');
    setNote(r.ok && r.sent ? t('testSent') : t('testNone'));
    setBusy(false);
  }

  if (state === 'loading') return null;
  if (mode === 'prompt') {
    if (state !== 'off' && state !== 'ios-home' && state !== 'denied') return null;
    return (
      <div className={bare ? 'flex items-center gap-2 py-2 pr-1 pl-3' : 'flex items-center gap-2 rounded-card border border-primary bg-primary-tint py-2 pr-1 pl-3'} data-push-prompt={state}>
        <Bell aria-hidden size={18} className="shrink-0 text-primary" />
        <p className="min-w-0 flex-1 py-1.5 text-sm text-text">{note ?? (state === 'ios-home' ? t('iosHome') : state === 'denied' ? t('denied') : t('promptEmployee'))}</p>
        {state === 'off' && (
          <button type="button" disabled={busy} onClick={turnOn} className={`min-h-9 shrink-0 rounded-button px-3 text-sm font-bold text-primary disabled:opacity-50 ${bare ? 'bg-primary-tint' : 'bg-bg'}`}>
            {t('promptOn')}
          </button>
        )}
      </div>
    );
  }
  const on = state === 'on';
  const can = state === 'on' || state === 'off';
  return (
    <div className="flex flex-col gap-1 rounded-button bg-surface px-3 py-2" data-push-toggle={state}>
      <div className="flex items-center gap-2">
        {on ? <Bell aria-hidden size={18} className="shrink-0 text-primary" /> : <BellOff aria-hidden size={18} className="shrink-0 text-faint" />}
        <span className="flex-1 text-sm font-bold">{t('title')}</span>
        {canTest && on && (
          <button type="button" disabled={busy} onClick={test} className="min-h-9 rounded-button px-2 text-sm font-bold text-primary disabled:opacity-50">
            {t('test')}
          </button>
        )}
        <button type="button" role="switch" aria-checked={on} aria-label={t('title')} disabled={busy || !can} onClick={on ? turnOff : turnOn} className="inline-flex min-h-9 items-center gap-2 text-sm font-bold disabled:opacity-50">
          <span className={on ? 'text-primary' : 'text-faint'}>{t(on ? 'on' : 'off')}</span>
          <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-chip transition-colors duration-150 ${on ? 'bg-primary' : 'bg-border'}`}>
            <span className={`absolute top-0.5 left-0.5 size-5 rounded-chip bg-bg shadow-sm transition-transform duration-150 ${on ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      </div>
      {/* 관리자(최고관리자 · 시스템관리자)에게는 「휴가 신청 · 정정 요청 …을 알려 드립니다」 설명을 빼고, 막혔을 때 할 일만 (2026-10-30 의뢰인) */}
      {(() => {
        const line = note ?? (state === 'ios-home' ? t('iosHome') : state === 'denied' ? t('denied') : state === 'unsupported' ? t('unsupported') : audience === 'employee' ? t('helpEmployee') : null);
        return line && <p className="text-xs text-muted">{line}</p>;
      })()}
    </div>
  );
}
