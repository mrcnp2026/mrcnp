'use client';
// 출퇴근 장소 만들기·고치기 양식 (2026-10-10). 지도를 눌러 핀을 옮기거나, 「지금 위치 넣기」, 또는 숫자를 직접 넣는다.
import { LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PlaceMap } from '@/components/PlaceMap';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
// 좌표를 아직 안 넣었을 때 지도가 처음 보여 주는 곳 (회사 소재지 부근 — 핀은 누를 때 생긴다)
const START = { lat: 35.7167, lng: 129.3167 };

export type PlaceValues = { id: string; label: string; address: string; lat: number; lng: number; radiusM: number };

export function PlaceForm({ initial, sheet }: { initial?: PlaceValues; sheet: string }) {
  const t = useTranslations('admin.places');
  const router = useRouter();
  const [lat, setLat] = useState(initial ? String(initial.lat) : '');
  const [lng, setLng] = useState(initial ? String(initial.lng) : '');
  const [radius, setRadius] = useState(String(initial?.radiusM ?? 80));
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const nLat = Number(lat);
  const nLng = Number(lng);
  const has = lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(nLat) && Number.isFinite(nLng) && Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180;
  const r = Number(radius);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        const res = await callApi<{ id?: string }>(initial ? `/api/admin/places/${initial.id}` : '/api/admin/places', { label: fd.get('label'), address: fd.get('address'), lat, lng, radiusM: radius });
        setBusy(false);
        if (!res.ok) return setErr(res);
        window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        if (!initial && res.data.id) router.push(`/admin/places/${res.data.id}`);
        router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('name')}
        <input name="label" required maxLength={40} defaultValue={initial?.label} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('address')}
        <input name="address" maxLength={200} defaultValue={initial?.address} className={field} autoComplete="off" />
      </label>
      <p className="text-sm text-muted">{t('pickHint')}</p>
      <PlaceMap
        lat={has ? nLat : START.lat}
        lng={has ? nLng : START.lng}
        radiusM={Number.isFinite(r) && r > 0 ? r : 80}
        empty={!has}
        onPick={(p) => {
          setLat(String(p.lat));
          setLng(String(p.lng));
        }}
        labels={{ zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') }}
      />
      <button
        type="button"
        disabled={locating === 'busy'}
        onClick={() => {
          if (!('geolocation' in navigator)) return setLocating('failed');
          setLocating('busy');
          navigator.geolocation.getCurrentPosition(
            (p) => {
              setLat(p.coords.latitude.toFixed(6));
              setLng(p.coords.longitude.toFixed(6));
              setLocating('idle');
            },
            () => setLocating('failed'),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        }}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-button border border-border px-3 text-sm font-bold text-primary disabled:opacity-60"
      >
        <LocateFixed aria-hidden size={18} />
        {t('useCurrent')}
      </button>
      {locating === 'failed' && <p className="text-sm text-warn">{t('locateFailed')}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('lat')}
          <input value={lat} onChange={(e) => setLat(e.target.value)} required inputMode="decimal" maxLength={12} className={`num ${field}`} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('lng')}
          <input value={lng} onChange={(e) => setLng(e.target.value)} required inputMode="decimal" maxLength={12} className={`num ${field}`} autoComplete="off" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('radiusInput')}
        <input value={radius} onChange={(e) => setRadius(e.target.value)} type="number" inputMode="numeric" min={30} max={1000} required className={`num ${field}`} />
      </label>
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.places" />}
      <Button type="submit" disabled={busy || !has}>
        {t('save')}
      </Button>
    </form>
  );
}

/** 끄기 / 다시 켜기 — 끄기는 한 번 더 묻는다 */
export function PlaceToggle({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('admin.places');
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const run = async () => {
    setBusy(true);
    const res = await callApi(`/api/admin/places/${id}`, { active: !active });
    setBusy(false);
    if (!res.ok) return setErr(res);
    setAsk(false);
    router.refresh();
  };
  return (
    <div className="flex flex-col items-start gap-2">
      {active && !ask ? (
        <button type="button" onClick={() => setAsk(true)} className="min-h-11 text-sm font-medium text-muted">
          {t('turnOff')}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" variant={active ? 'danger' : 'outline'} disabled={busy} onClick={run}>
            {active ? t('turnOffConfirm') : t('turnOn')}
          </Button>
          {active && (
            <button type="button" onClick={() => setAsk(false)} className="min-h-11 px-2 text-sm text-muted">
              {t('cancel')}
            </button>
          )}
        </div>
      )}
      {active && ask && <p className="text-sm text-muted">{t('turnOffNote')}</p>}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.places" />}
    </div>
  );
}
