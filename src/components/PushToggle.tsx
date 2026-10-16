'use client';
// 폰 알림 받기 켜기 · 끄기 (웹 푸시, 2026-10-16 의뢰인: 휴가 신청 · 미출근자 · 정정 요청을 관리자 폰으로). 관리자 · 지점관리자 메뉴 아래에 한 줄.
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

export function PushToggle() {
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
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [install]);

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
  const small = 'min-h-9 rounded-button px-3 text-sm font-bold disabled:opacity-50';
  return (
    <div className="flex flex-col gap-1 rounded-button bg-surface px-3 py-2" data-push-toggle={state}>
      <div className="flex items-center gap-2">
        {state === 'on' ? <Bell aria-hidden size={18} className="shrink-0 text-primary" /> : <BellOff aria-hidden size={18} className="shrink-0 text-faint" />}
        <span className="flex-1 text-sm font-bold">
          {t('title')} <span className={state === 'on' ? 'text-primary' : 'text-faint'}>· {t(state === 'on' ? 'on' : 'off')}</span>
        </span>
        {state === 'off' && (
          <button type="button" disabled={busy} onClick={turnOn} className={`${small} bg-primary text-on-primary`}>
            {t('turnOn')}
          </button>
        )}
        {state === 'on' && (
          <>
            <button type="button" disabled={busy} onClick={test} className={`${small} text-primary`}>
              {t('test')}
            </button>
            <button type="button" disabled={busy} onClick={turnOff} className={`${small} text-muted`}>
              {t('turnOff')}
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-muted">
        {note ?? (state === 'ios-home' ? t('iosHome') : state === 'denied' ? t('denied') : state === 'unsupported' ? t('unsupported') : t('help'))}
      </p>
    </div>
  );
}
