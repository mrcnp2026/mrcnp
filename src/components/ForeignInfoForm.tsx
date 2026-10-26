'use client';
// 외국인 정보 (묶음 31, 2026-10-20 의뢰인: 태국 · 베트남 직원) — 관리자만. 국적 · 체류 자격 · 체류 기간 끝 · 국내 첫 근로일.
// 평소에는 한 줄 요약 + 보험 · 세금 「제안」, [고치기]를 누르면 입력 칸. 제안은 바꾸지 않고 보여 주기만 한다(정하는 곳은 사원별 급여).
// 폰: 칸은 세로로 쌓고 짧은 칸만 두 개씩 — 가로 넘침 없음.
import { Select } from '@/components/Select';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { COUNTRIES, daysToStayEnd, suggestForeign, VISAS, type ForeignInfo, type Suggest } from '@/lib/foreign-rules';

const input = 'min-h-11 w-full min-w-0 rounded-button border border-border bg-bg px-3 text-base lg:min-h-10 lg:text-sm';
const TONE: Record<Suggest, string> = { YES: 'text-ok', NO: 'text-muted', CHECK: 'text-warn', ON_REQUEST: 'text-info' };

export function ForeignInfoForm({ endpoint, initial, today, payHref }: { endpoint: string; initial: ForeignInfo; today: string; payHref: string }) {
  const t = useTranslations('details.foreign');
  const tc = useTranslations('common');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nationality, setNationality] = useState(initial.nationality ?? '');
  const [other, setOther] = useState(initial.nationality && !(COUNTRIES as readonly string[]).includes(initial.nationality) ? initial.nationality : '');
  const [visaType, setVisaType] = useState(initial.visaType ?? '');
  const [stayUntil, setStayUntil] = useState(initial.stayUntil ?? '');
  const [firstWork, setFirstWork] = useState(initial.firstWorkInKorea ?? '');
  // 묶음 32: 영어 이름 · 활동허가 만료일 · 출입국 방문 예약일 · 숙소
  const [englishName, setEnglishName] = useState(initial.englishName ?? '');
  const [permit, setPermit] = useState(initial.activityPermitUntil ?? '');
  const [visit, setVisit] = useState(initial.immigrationVisitOn ?? '');
  const [dorm, setDorm] = useState(initial.dormitory ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; requestId?: string } | null>(null);

  const s = suggestForeign(initial, today);
  const left = daysToStayEnd(initial.stayUntil, today);
  const countryName = (c: string) => (t.has(`country.${c}`) ? t(`country.${c}`) : c);

  if (!editing) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 flex-1 font-semibold">
            {initial.nationality ? t('summary', { country: countryName(initial.nationality), visa: initial.visaType ?? t('visaNone') }) : t('domestic')}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden size={16} strokeWidth={1.75} />
            {t('edit')}
          </Button>
        </div>
        {initial.nationality && (
          <>
            <p className="num text-muted">
              {initial.stayUntil ? t('stayLine', { date: initial.stayUntil }) : t('stayNone')}
              {left !== null && <span className={left <= 30 ? ' font-semibold text-danger' : left <= 60 ? ' font-semibold text-warn' : ''}>{' · '}{left < 0 ? t('stayOver', { n: -left }) : t('stayLeft', { n: left })}</span>}
            </p>
            {(initial.englishName || initial.dormitory || initial.activityPermitUntil || initial.immigrationVisitOn) && (
              <dl className="num grid grid-cols-1 gap-x-4 gap-y-1 text-muted sm:grid-cols-2">
                {initial.englishName && <div className="flex gap-2"><dt className="shrink-0">{t('englishName')}</dt><dd className="min-w-0 truncate font-semibold text-text">{initial.englishName}</dd></div>}
                {initial.dormitory && <div className="flex gap-2"><dt className="shrink-0">{t('dormitory')}</dt><dd className="min-w-0 truncate font-semibold text-text">{initial.dormitory}</dd></div>}
                {initial.activityPermitUntil && (() => { const d = daysToStayEnd(initial.activityPermitUntil, today)!; return <div className="flex gap-2"><dt className="shrink-0">{t('permit')}</dt><dd className={d <= 30 ? 'font-semibold text-danger' : d <= 60 ? 'font-semibold text-warn' : 'text-text'}>{initial.activityPermitUntil} · {d < 0 ? t('stayOver', { n: -d }) : t('stayLeft', { n: d })}</dd></div>; })()}
                {initial.immigrationVisitOn && (() => { const d = daysToStayEnd(initial.immigrationVisitOn, today)!; return <div className="flex gap-2"><dt className="shrink-0">{t('visit')}</dt><dd className={d >= 0 && d <= 3 ? 'font-semibold text-warn' : 'text-text'}>{initial.immigrationVisitOn}{d >= 0 ? ` · ${t('stayLeft', { n: d })}` : ''}</dd></div>; })()}
              </dl>
            )}
            {s && (
              <div className="rounded-button border border-border p-3">
                <p className="pb-2 font-bold">{t('suggestTitle')}</p>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {(['pension', 'health', 'employment', 'accident'] as const).map((k) => (
                    <li key={k} className="flex flex-wrap gap-x-2">
                      <span className="w-20 shrink-0 text-muted">{t(`ins.${k}`)}</span>
                      <span className={`min-w-0 flex-1 font-semibold ${TONE[s[k]]}`}>{t(`sug.${s[k]}`)}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-muted">{t(`flat.${s.flatTax}`)}</p>
                {s.departureInsurance && <p className="pt-1 text-muted">{t('departure')}</p>}
                <p className="pt-2 text-xs text-faint">{t('suggestNote')}</p>
                <Link href={payHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary lg:min-h-9">
                  {t('goPay')} ›
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const chosen = nationality === 'OTHER' ? other.trim().toUpperCase() : nationality;
  return (
    <form
      className="flex flex-col gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const r = await callApi(endpoint, { nationality: chosen || null, visaType: visaType || null, stayUntil: stayUntil || null, firstWorkInKorea: firstWork || null, englishName: englishName || null, activityPermitUntil: permit || null, immigrationVisitOn: visit || null, dormitory: dorm || null });
        setBusy(false);
        if (!r.ok) return setErr({ code: r.code, requestId: r.requestId });
        setEditing(false);
        router.refresh();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted">{t('nationality')}</span>
          <Select value={nationality && !(COUNTRIES as readonly string[]).includes(nationality) && nationality !== 'OTHER' ? 'OTHER' : nationality} onChange={(e) => setNationality(e.target.value)} className={input}>
            <option value="">{t('domestic')}</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {countryName(c)}
              </option>
            ))}
            <option value="OTHER">{t('otherCountry')}</option>
          </Select>
        </label>
        {(nationality === 'OTHER' || (nationality && !(COUNTRIES as readonly string[]).includes(nationality))) && (
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-muted">{t('otherCode')}</span>
            <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={2} className={`${input} uppercase`} autoComplete="off" />
          </label>
        )}
        {chosen && (
          <>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('visa')}</span>
              <input value={visaType} onChange={(e) => setVisaType(e.target.value)} list="visa-list" maxLength={10} placeholder="E-9" className={`${input} uppercase`} autoComplete="off" />
              <datalist id="visa-list">
                {VISAS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('stayUntil')}</span>
              <input type="date" value={stayUntil} onChange={(e) => setStayUntil(e.target.value)} className={input} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('firstWork')}</span>
              <input type="date" value={firstWork} max={today} onChange={(e) => setFirstWork(e.target.value)} className={input} />
              <span className="text-xs text-faint">{t('firstWorkHint')}</span>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('englishName')}</span>
              <input value={englishName} onChange={(e) => setEnglishName(e.target.value)} maxLength={60} className={`${input} uppercase`} autoComplete="off" />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('dormitory')}</span>
              <input value={dorm} onChange={(e) => setDorm(e.target.value)} maxLength={100} className={input} autoComplete="off" />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('permit')}</span>
              <input type="date" value={permit} onChange={(e) => setPermit(e.target.value)} className={input} />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-muted">{t('visit')}</span>
              <input type="date" value={visit} onChange={(e) => setVisit(e.target.value)} className={input} />
            </label>
          </>
        )}
      </div>
      {err && <ErrorNote code={err.code} requestId={err.requestId} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? tc('working') : t('save')}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
