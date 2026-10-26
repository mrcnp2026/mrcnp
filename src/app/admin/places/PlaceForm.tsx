'use client';
// 출퇴근 장소 만들기 · 고치기 양식 (2026-10-10, 2026-10-22 다시 짬 — 의뢰인: 「주소 검색도 안 되고 직접 좌표를 입력해야 해서 굉장히 불편하다, 다우오피스처럼」).
// 묶음 셋: ① 기본 정보(이름) ② 위치 — [주소 검색](다음 우편번호 창) → 고르면 좌표를 찾아 지도 핀이 그 자리로(/api/admin/geocode),
//   지도를 눌러 핀을 미세하게 옮기거나 「지금 위치 넣기」. 좌표 숫자는 「직접 입력」 안에 접어 둔다 ③ 출퇴근 허용 범위 — 자주 쓰는 반경 단추 + 끌어서 정하기.
// sheet: 팝업(AddSheet) 안이면 그 창 이름 — 저장하면 닫는다. 없으면 화면에 펼쳐 둔 양식(PC 오른쪽 칸).
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { PlaceMap } from '@/components/PlaceMap';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text lg:min-h-10 lg:text-sm';
// 좌표를 아직 안 넣었을 때 지도가 처음 보여 주는 곳 (회사 소재지 부근 — 핀은 주소를 고르거나 누를 때 생긴다)
const START = { lat: 35.7167, lng: 129.3167 };
const RADII = [50, 80, 100, 200, 300] as const;
const POSTCODE_JS = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

type PostcodeData = { roadAddress: string; jibunAddress: string; autoJibunAddress?: string; sido: string; sigungu: string; bname: string; buildingName?: string };
type PostcodeCtor = new (o: { oncomplete: (d: PostcodeData) => void; width: string; height: string }) => { embed: (el: HTMLElement) => void };
declare global {
  interface Window {
    daum?: { Postcode: PostcodeCtor };
  }
}
let postcodeLoad: Promise<void> | null = null;
const loadPostcode = () =>
  (postcodeLoad ??= new Promise<void>((ok, fail) => {
    if (window.daum?.Postcode) return ok();
    const s = document.createElement('script');
    s.src = POSTCODE_JS;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      postcodeLoad = null;
      fail(new Error('postcode'));
    };
    document.head.appendChild(s);
  }));

export type PlaceValues = { id: string; label: string; address: string; lat: number; lng: number; radiusM: number; anywhere?: boolean };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  );
}

export function PlaceForm({ initial, sheet }: { initial?: PlaceValues; sheet?: string }) {
  const t = useTranslations('admin.places');
  const router = useRouter();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [detail, setDetail] = useState('');
  const [lat, setLat] = useState(initial ? String(initial.lat) : '');
  const [lng, setLng] = useState(initial ? String(initial.lng) : '');
  const [radius, setRadius] = useState(initial?.radiusM ?? 80);
  const [anywhere, setAnywhere] = useState(!!initial?.anywhere);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [finding, setFinding] = useState<'idle' | 'open' | 'busy' | 'ok' | 'approx' | 'none' | 'blocked'>('idle');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const nLat = Number(lat);
  const nLng = Number(lng);
  const has = lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(nLat) && Number.isFinite(nLng) && Math.abs(nLat) <= 90 && Math.abs(nLng) <= 180;
  const pin = (p: { lat: number; lng: number }) => {
    setLat(p.lat.toFixed(6));
    setLng(p.lng.toFixed(6));
  };

  // 주소 검색 창 — 열면 다음 우편번호 창을 이 판 안에 넣는다
  useEffect(() => {
    if (finding !== 'open' || !layer.current) return;
    const el = layer.current;
    let live = true;
    loadPostcode()
      .then(() => {
        if (!live || !window.daum) return;
        el.innerHTML = '';
        new window.daum.Postcode({
          width: '100%',
          height: '100%',
          oncomplete: async (d) => {
            const road = d.roadAddress || '';
            const jibun = d.jibunAddress || d.autoJibunAddress || '';
            setAddress([road || jibun, d.buildingName ? `(${d.buildingName})` : ''].filter(Boolean).join(' '));
            setFinding('busy');
            const r = await callApi<{ lat: number; lng: number; approx: boolean }>('/api/admin/geocode', { road, jibun, area: [d.sido, d.sigungu, d.bname].filter(Boolean).join(' ') });
            if (!r.ok) return setFinding('none');
            pin(r.data);
            setFinding(r.data.approx ? 'approx' : 'ok');
          },
        }).embed(el);
      })
      .catch(() => live && setFinding('blocked'));
    return () => {
      live = false;
    };
  }, [finding]);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        setDone(false);
        const full = [address.trim(), detail.trim()].filter(Boolean).join(' ');
        const res = await callApi<{ id?: string }>(initial ? `/api/admin/places/${initial.id}` : '/api/admin/places', { label, address: full, lat, lng, radiusM: String(radius), anywhere });
        setBusy(false);
        if (!res.ok) return setErr(res);
        if (sheet) window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: sheet }));
        else setDone(true);
        if (!initial && res.data.id) router.push(`/admin/places/${res.data.id}`);
        router.refresh();
      }}
    >
      <Group title={t('groupBasic')}>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('name')}
          <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} className={field} autoComplete="off" placeholder={t('namePlaceholder')} />
        </label>
      </Group>

      <Group title={t('groupWhere')}>
        <div className="flex flex-col gap-1 text-sm text-muted">
          <span>{t('address')}</span>
          <div className="flex gap-2">
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={180} className={`${field} min-w-0 flex-1`} autoComplete="off" placeholder={t('addressPlaceholder')} aria-label={t('address')} />
            <button type="button" onClick={() => setFinding('open')} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:min-h-10">
              <Search aria-hidden size={16} />
              {t('findAddress')}
            </button>
          </div>
          <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={60} className={field} autoComplete="off" placeholder={t('detailPlaceholder')} aria-label={t('detail')} />
        </div>
        {finding === 'open' && (
          <div className="relative overflow-hidden rounded-card border border-border">
            <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
              <span className="text-sm font-bold">{t('findAddress')}</span>
              <button type="button" onClick={() => setFinding('idle')} aria-label={t('cancel')} className="flex size-8 items-center justify-center rounded-button text-muted hover:bg-bg">
                <X aria-hidden size={18} />
              </button>
            </div>
            <div ref={layer} className="h-112" />
          </div>
        )}
        {finding === 'busy' && <p className="text-sm text-muted">{t('finding')}</p>}
        {finding === 'ok' && <p className="flex items-center gap-1.5 text-sm font-semibold text-ok"><MapPin aria-hidden size={16} />{t('foundOk')}</p>}
        {finding === 'approx' && <p className="rounded-button bg-warn-tint px-3 py-2 text-sm text-warn">{t('foundApprox')}</p>}
        {finding === 'none' && <p className="rounded-button bg-warn-tint px-3 py-2 text-sm text-warn">{t('foundNone')}</p>}
        {finding === 'blocked' && <p className="rounded-button bg-warn-tint px-3 py-2 text-sm text-warn">{t('findBlocked')}</p>}

        <PlaceMap
          lat={has ? nLat : START.lat}
          lng={has ? nLng : START.lng}
          radiusM={anywhere ? 0 : radius}
          empty={!has}
          onPick={pin}
          labels={{ zoomIn: t('zoomIn'), zoomOut: t('zoomOut'), credit: t('mapCredit'), map: t('map') }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-sm text-faint">{t('pickHint')}</p>
          <button
            type="button"
            disabled={locating === 'busy'}
            onClick={() => {
              if (!('geolocation' in navigator)) return setLocating('failed');
              setLocating('busy');
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  pin({ lat: p.coords.latitude, lng: p.coords.longitude });
                  setLocating('idle');
                },
                () => setLocating('failed'),
                { enableHighAccuracy: true, timeout: 10000 },
              );
            }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-button border border-border bg-bg px-3 text-sm font-semibold text-text hover:bg-surface disabled:opacity-60"
          >
            <LocateFixed aria-hidden size={16} />
            {t('useCurrent')}
          </button>
        </div>
        {locating === 'failed' && <p className="text-sm text-warn">{t('locateFailed')}</p>}
        <details className="group text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">
            {t('coordsManual')}
            {has && <span className="num ml-2 text-faint">{nLat.toFixed(5)}, {nLng.toFixed(5)}</span>}
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="flex flex-col gap-1 text-muted">
              {t('lat')}
              <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" maxLength={12} className={`num ${field}`} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-muted">
              {t('lng')}
              <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" maxLength={12} className={`num ${field}`} autoComplete="off" />
            </label>
          </div>
        </details>
      </Group>

      <Group title={t('groupRange')}>
        <div className={`flex flex-col gap-3 ${anywhere ? 'pointer-events-none opacity-40' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            {RADII.map((m) => (
              <button key={m} type="button" onClick={() => setRadius(m)} aria-pressed={radius === m} className={`num inline-flex min-h-9 items-center rounded-chip border px-3.5 text-sm font-semibold ${radius === m ? 'border-primary bg-primary-tint text-primary' : 'border-border bg-bg text-text hover:bg-surface'}`}>
                {t('radiusM', { n: m })}
              </button>
            ))}
            <span className="num ml-auto text-lg font-bold">{t('radiusM', { n: radius })}</span>
          </div>
          <input type="range" min={30} max={1000} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label={t('radiusInput')} className="w-full accent-primary" />
          <p className="text-xs text-faint">{t('radiusHint')}</p>
        </div>
        {/* 어디서나 (묶음 21): 켜면 반경과 상관없이 이 장소로 확인 — 외근 · 원격근무용. 위치가 꺼져 있으면 인정하지 않는다 */}
        <label className="flex min-h-11 items-start gap-3 rounded-button border border-border bg-bg p-3 text-sm">
          <input type="checkbox" checked={anywhere} onChange={(e) => setAnywhere(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
          <span className="flex flex-col gap-0.5">
            <span className="font-bold text-text">{t('anywhere')}</span>
            <span className="text-muted">{t('anywhereHelp')}</span>
          </span>
        </label>
      </Group>

      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.places" />}
      {done && <p role="status" className="text-sm font-semibold text-ok">{t('saved')}</p>}
      <div className="flex items-center justify-end gap-2">
        {!has && <span className="mr-auto text-sm text-warn">{t('needPin')}</span>}
        <Button type="submit" disabled={busy || !has || !label.trim()}>
          {t('save')}
        </Button>
      </div>
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
