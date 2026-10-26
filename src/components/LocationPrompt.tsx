'use client';
// 위치 허용 안내 한 줄 (2026-10-18 의뢰인: 앱을 시작할 때 GPS 허용을 받아 두면 「위치 없음」이 줄어든다).
// 웹 앱은 「항상 허용」을 강제할 수 없다 — 아직 묻지 않았으면 [위치 허용] 단추로 브라우저 허용 창을 띄우고,
// 한 번 거부했으면 앱이 다시 물을 수 없으니 켜는 방법을 알려 준다. 허용돼 있거나 브라우저가 상태를 알려 주지 않으면 아무것도 보이지 않는다.
// 이 기기에서 위치를 한 번이라도 받았으면 「아직 안 물음」이어도 숨긴다 (2026-10-21 의뢰인: 허용을 눌렀는데 열 때마다 다시 뜬다 —
// 아이폰 「다음 번에 묻기」 · 안드로이드 「이번만 허용」은 매번 처음 상태로 돌아간다). 출퇴근을 누를 때 위치는 그대로 받는다.
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { currentPosition, geoOkBefore, rememberGeoOk } from './current-position';

type State = 'unknown' | 'granted' | 'prompt' | 'denied';

/** bare: 상자 없이 한 줄만 (여러 안내를 한 상자에 묶을 때) */
export function LocationPrompt({ bare = false }: { bare?: boolean } = {}) {
  const t = useTranslations('locationPrompt');
  const [state, setState] = useState<State>('unknown');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const read = () => {
      if (!status) return;
      if (status.state === 'granted') rememberGeoOk();
      setState(status.state === 'prompt' && geoOkBefore() ? 'granted' : (status.state as State));
    };
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((s) => {
        status = s;
        read();
        s.addEventListener('change', read);
      })
      .catch(() => {});
    return () => status?.removeEventListener('change', read);
  }, []);
  if (state === 'unknown' || state === 'granted') return null;
  return (
    <div className={bare ? 'flex items-center gap-2 py-2 pr-2 pl-3' : 'flex items-center gap-2 rounded-card border border-warn bg-warn-tint py-2 pr-2 pl-3'} data-location-prompt={state}>
      <MapPin aria-hidden size={18} className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-sm text-text">{t(state === 'denied' ? 'denied' : 'ask')}</p>
      {state === 'prompt' && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const p = await currentPosition();
            setBusy(false);
            if (p) setState('granted');
          }}
          className="min-h-9 shrink-0 rounded-button bg-primary px-3 text-sm font-bold text-on-primary disabled:opacity-50"
        >
          {t('allow')}
        </button>
      )}
    </div>
  );
}
