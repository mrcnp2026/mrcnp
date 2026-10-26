'use client';
// 설정 화면의 입력 양식들 — 전부 /api/admin/settings 한 곳으로 보낸다. 저장하면 화면을 새로 읽는다.
import { Select } from '@/components/Select';
import { ROUND_STEPS } from '@/lib/settings-rules';
import { useFormatter, useTranslations } from 'next-intl';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, ListPlus, Wifi, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { callApi } from '@/components/client-api';
import { DateTimeInput } from '@/components/DateTimeInput';
import { ErrorNote } from '@/components/ErrorNote';
import { HelpTip } from '@/components/Help';
import { useSaveRule } from '@/components/useSaveRule';
import { Button } from '@/components/ui';

const field = 'min-h-11 w-full rounded-button border border-border bg-bg px-3 text-base text-text';
type Err = { code: string; requestId?: string } | null;

function useSettingsPost() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await callApi('/api/admin/settings', body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return false;
    }
    router.refresh();
    return true;
  };
  return { busy, err, post };
}

/** 한 번 더 확인하고 실행하는 작은 버튼 (숨기기·빼기·끄기) */
export function ConfirmButton({ body, label, confirmLabel, ariaLabel }: { body: Record<string, unknown>; label: string; confirmLabel: string; ariaLabel: string }) {
  const { busy, err, post } = useSettingsPost();
  const [ask, setAsk] = useState(false);
  return (
    <span className="flex shrink-0 flex-col items-end">
      {ask ? (
        <span className="flex items-center gap-1">
          <button type="button" disabled={busy} onClick={async () => (await post(body)) && setAsk(false)} className="min-h-11 rounded-button bg-danger px-3 text-sm font-bold text-on-primary disabled:opacity-60">
            {confirmLabel}
          </button>
          <button type="button" onClick={() => setAsk(false)} aria-label={ariaLabel} className="min-h-11 px-2 text-sm text-muted">
            ✕
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setAsk(true)} aria-label={ariaLabel} className="min-h-11 px-2 text-sm font-medium text-muted">
          {label}
        </button>
      )}
      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
    </span>
  );
}

function Fold({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold whitespace-nowrap text-primary lg:h-9 lg:min-h-0 lg:rounded-button lg:bg-primary lg:px-3.5 lg:font-semibold lg:text-on-primary">
        <Icon aria-hidden size={16} />
        {label}
      </button>
    );
  }
  // 폰: 그 자리에 펼친다 · PC: 가운데 팝업 (2026-10-11 의뢰인: PC의 양식은 팝업으로)
  return (
    <div className="w-full rounded-button bg-surface p-4 lg:fixed lg:inset-0 lg:z-40 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:bg-text/40 lg:p-6">
      <div role="dialog" aria-modal="true" aria-label={label} className="lg:max-h-full lg:w-full lg:max-w-xl lg:overflow-y-auto lg:rounded-card lg:bg-bg lg:p-6 lg:text-left lg:shadow-card">
        <h2 className="hidden pb-4 text-lg font-bold text-text lg:block">{label}</h2>
        {children(() => setOpen(false))}
      </div>
    </div>
  );
}

export type RuleValues = { startTime: string; endTime: string; lateGraceMin: number; breakStart: string; breakEnd: string; break2Start: string; break2End: string; roundStepMin: number; workdays: number[]; weeklyRestDay: number };

export function RuleForm({ initial, tomorrow, weekdays }: { initial: RuleValues; tomorrow: string; weekdays: string[] }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  const [days, setDays] = useState<number[]>(initial.workdays);
  const [rest, setRest] = useState(initial.weeklyRestDay);
  return (
    <Fold label={t('ruleAdd')} icon={ListPlus}>
      {(close) => <RuleFields t={t} close={close} post={post} busy={busy} err={err} initial={initial} tomorrow={tomorrow} weekdays={weekdays} days={days} setDays={setDays} rest={rest} setRest={setRest} />}
    </Fold>
  );
}

// 양식 몸통 — 열릴 때마다 새로 그려져야 저장 규칙(처음 값)이 그때의 값으로 잡힌다
function RuleFields({ t, close, post, busy, err, initial, tomorrow, weekdays, days, setDays, rest, setRest }: { t: ReturnType<typeof useTranslations>; close: () => void; post: ReturnType<typeof useSettingsPost>['post']; busy: boolean; err: ReturnType<typeof useSettingsPost>['err']; initial: RuleValues; tomorrow: string; weekdays: string[]; days: number[]; setDays: (d: number[]) => void; rest: number; setRest: (n: number) => void }) {
  const rule = useSaveRule();
  return (
        <form
          ref={rule.ref}
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            if (await post({ action: 'rule.add', ...Object.fromEntries([...fd].filter(([k]) => !k.startsWith('_'))), workdays: days, weeklyRestDay: rest })) close();
          }}
        >
          <p className="text-sm text-muted">{t('ruleAddHint')}</p>
          {/* 단추로 고르는 값도 저장 규칙의 비교에 넣는다(서버로는 보내지 않는다) */}
          <input type="hidden" name="_days" value={days.join(',')} />
          <input type="hidden" name="_rest" value={rest} />
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('effectiveFrom')}
            <DateTimeInput name="effectiveFrom" type="date" required defaultValue={tomorrow} className={`num ${field}`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('start')}
              <DateTimeInput name="startTime" type="time" required defaultValue={initial.startTime} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('end')}
              <DateTimeInput name="endTime" type="time" required defaultValue={initial.endTime} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('breakStart')}
              <DateTimeInput name="breakStart" type="time" defaultValue={initial.breakStart} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('breakEnd')}
              <DateTimeInput name="breakEnd" type="time" defaultValue={initial.breakEnd} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('break2Start')}
              <DateTimeInput name="break2Start" type="time" defaultValue={initial.break2Start} className={`num ${field}`} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('break2End')}
              <DateTimeInput name="break2End" type="time" defaultValue={initial.break2End} className={`num ${field}`} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('roundStep')}
            <Select name="roundStepMin" defaultValue={initial.roundStepMin} className={`num ${field}`}>
              {ROUND_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('roundOff') : t('roundValue', { n })}
                </option>
              ))}
            </Select>
            <span className="text-xs text-faint">{t('roundHint')}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('grace')}
            <input name="lateGraceMin" type="number" inputMode="numeric" min={0} max={120} required defaultValue={initial.lateGraceMin} className={`num ${field}`} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm text-muted">{t('workdays')}</legend>
            <div className="grid grid-cols-7 gap-1">
              {weekdays.map((w, i) => {
                const d = i + 1;
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    disabled={d === rest}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={`min-h-11 rounded-button text-sm font-bold disabled:opacity-40 ${on ? 'bg-primary text-on-primary' : 'bg-bg text-muted'}`}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('restDay')}
            <Select
              value={rest}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRest(v);
                setDays(days.filter((x) => x !== v));
              }}
              className={field}
            >
              {weekdays.map((w, i) => (
                <option key={w} value={i + 1}>
                  {w}
                </option>
              ))}
            </Select>
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || days.length === 0 || !rule.dirty}>
              {t('save')}
            </Button>
          </div>
        </form>
  );
}

export function HolidayForm({ monthStart }: { monthStart: string }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  return (
    <Fold label={t('holidayAdd')} icon={CalendarPlus}>
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: 'holiday.add', ...Object.fromEntries(new FormData(e.currentTarget)) })) close();
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayDate')}
            <DateTimeInput name="date" type="date" required className={`num ${field}`} />
            <span className="text-xs text-faint">{t('holidayDateHint', { date: monthStart })}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayLabel')}
            <input name="label" required maxLength={40} className={field} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('holidayKind')}
            <Select name="kind" defaultValue="company" className={field}>
              <option value="company">{t('kind.company')}</option>
              <option value="public">{t('kind.public')}</option>
            </Select>
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Fold>
  );
}

export function NetworkForm({ currentIp, currentKnown, locationId }: { currentIp: string | null; currentKnown: boolean; locationId: string }) {
  const t = useTranslations('admin.settings');
  const { busy, err, post } = useSettingsPost();
  const [cidr, setCidr] = useState('');
  const [filled, setFilled] = useState(false); // 「이 기기 주소 넣기」를 눌러 칸에 들어갔다
  const input = useRef<HTMLInputElement>(null);
  return (
    <Fold label={t('networkAdd')} icon={Wifi}>
      {(close) => (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: 'network.add', locationId, cidr, label: new FormData(e.currentTarget).get('label') })) close();
          }}
        >
          <p className="text-sm text-muted">{t('networkAddHint')}</p>
          {/* 지금 접속한 주소 — 누르면 아래 칸에 들어가고, 들어간 것이 눈에 보인다 (2026-10-25 의뢰인: 눌러도 반응이 없어 보인다 → 버튼 모양 + 확인 표시) */}
          <div className="flex flex-col gap-2 rounded-card border border-border bg-bg p-3">
            {currentIp ? (
              <>
                <p className="text-sm text-muted">
                  {t('networkNow')} <b className="num text-text">{currentIp}</b>
                </p>
                {currentKnown ? (
                  <p className="inline-flex items-center gap-1 text-sm text-ok">
                    <Check aria-hidden size={16} />
                    {t('networkKnown')}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={filled ? 'outline' : 'primary'}
                      className="min-h-11"
                      onClick={() => {
                        setCidr(currentIp);
                        setFilled(true);
                        input.current?.focus();
                      }}
                    >
                      {filled ? <Check aria-hidden size={16} /> : <Wifi aria-hidden size={16} />}
                      {filled ? t('networkFilledBtn') : t('networkUseBtn')}
                    </Button>
                    {filled && <span role="status" className="text-sm text-ok">{t('networkFilled')}</span>}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">{t('networkNoIp')}</p>
            )}
          </div>
          {/* 고정 IP를 직접 넣는 사람을 위한 확인 방법 — ? 를 눌러야 나온다 (2026-10-22 의뢰인) */}
          <div className="flex flex-col gap-1 text-sm text-muted">
            <span className="flex items-center gap-1">
              {t('networkCidr')}
              <HelpTip>
                <span className="flex flex-col gap-2">
                  <span>{t('networkHelp.what')}</span>
                  <span>{t('networkHelp.way1')}</span>
                  <span>{t('networkHelp.way2')}</span>
                  <span>{t('networkHelp.way3')}</span>
                  <span>{t('networkHelp.format')}</span>
                </span>
              </HelpTip>
            </span>
            <input ref={input} value={cidr} onChange={(e) => { setCidr(e.target.value); setFilled(false); }} required maxLength={50} aria-label={t('networkCidr')} placeholder="211.234.10.5" className={`num ${field} ${filled ? 'border-ok' : ''}`} autoComplete="off" />
          </div>
          <label className="flex flex-col gap-1 text-sm text-muted">
            {t('networkLabel')}
            <input name="label" maxLength={40} className={field} autoComplete="off" />
          </label>
          {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !cidr.trim()}>
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </Fold>
  );
}

/**
 * 회사 지정 휴일 달력 (2026-10-22 의뢰인: 「글자 목록 + 넣기 · 빼기 대신 달력으로 — 달을 넘기며 날짜를 눌러 넣거나 빼게」).
 * 날짜를 누르면 옆 칸(폰은 아래)에: 휴일이면 이름 · 종류 + [이 휴일 빼기], 아니면 이름 · 종류 + [휴일로 넣기].
 * 이번 달 1일보다 앞선 날은 바꿀 수 없다(서버 규칙 그대로 — 지난 기록의 휴일 근로 계산이 바뀌지 않게).
 */
export function HolidayCalendar({ holidays, today, monthStart }: { holidays: { the_date: string; label: string; kind: string }[]; today: string; monthStart: string }) {
  const t = useTranslations('admin.settings');
  const f = useFormatter();
  const { busy, err, post } = useSettingsPost();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [pick, setPick] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const byDate = new Map(holidays.map((h) => [h.the_date, h]));
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay(); // 일요일 = 0
  const iso = (d: number) => `${ym}-${String(d).padStart(2, '0')}`;
  const move = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    setPick(null);
    setAsk(false);
  };
  const weekdays = [...Array(7)].map((_, i) => f.dateTime(new Date(Date.UTC(2024, 0, 7 + i, 3)), { weekday: 'short' })); // 2024-01-07 = 일요일
  const inMonth = holidays.filter((h) => h.the_date.startsWith(ym));
  const picked = pick ? byDate.get(pick) : undefined;
  const locked = pick !== null && pick < monthStart;
  const longDay = (d: string) => f.dateTime(new Date(`${d}T12:00:00+09:00`), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const tone = (kind: string) => (kind === 'public' ? 'bg-danger-tint text-danger' : 'bg-primary-tint text-primary');
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => move(-1)} aria-label={t('cal.prev')} className="flex size-10 items-center justify-center rounded-button border border-border bg-bg text-muted hover:text-text lg:size-9">
            <ChevronLeft aria-hidden size={18} />
          </button>
          <span className="num min-w-32 text-center text-lg font-bold">{f.dateTime(new Date(Date.UTC(y, m - 1, 15)), { year: 'numeric', month: 'long' })}</span>
          <button type="button" onClick={() => move(1)} aria-label={t('cal.next')} className="flex size-10 items-center justify-center rounded-button border border-border bg-bg text-muted hover:text-text lg:size-9">
            <ChevronRight aria-hidden size={18} />
          </button>
          {ym !== today.slice(0, 7) && (
            <button type="button" onClick={() => { setYm(today.slice(0, 7)); setPick(null); }} className="inline-flex min-h-10 items-center rounded-button border border-border bg-bg px-3 text-sm text-muted hover:text-text lg:min-h-9">
              {t('cal.today')}
            </button>
          )}
          <span className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><span aria-hidden className="size-2.5 rounded-sm bg-danger" />{t('kind.public')}</span>
            <span className="flex items-center gap-1"><span aria-hidden className="size-2.5 rounded-sm bg-primary" />{t('kind.company')}</span>
          </span>
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-bg">
          <div className="grid grid-cols-7 border-b border-border bg-surface/60 text-center text-xs font-semibold">
            {weekdays.map((w, i) => (
              <span key={w} className={`py-2 ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted'}`}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {[...Array(lead)].map((_, i) => (
              <span key={`b${i}`} className="min-h-16 border-b border-border bg-surface/30 lg:min-h-20" />
            ))}
            {[...Array(days)].map((_, i) => {
              const d = iso(i + 1);
              const h = byDate.get(d);
              const wd = (lead + i) % 7;
              const past = d < monthStart;
              const on = pick === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setPick(on ? null : d); setAsk(false); }}
                  aria-pressed={on}
                  aria-label={`${longDay(d)}${h ? ` · ${h.label}` : ''}`}
                  className={`flex min-h-16 flex-col items-stretch gap-1 border-b border-border p-1 text-left transition-colors lg:min-h-20 lg:p-1.5 ${(lead + i) % 7 !== 6 ? 'border-r' : ''} ${on ? 'bg-primary-tint ring-2 ring-primary ring-inset' : past ? 'bg-surface/40' : 'hover:bg-surface'}`}
                >
                  <span className={`num flex size-6 items-center justify-center rounded-chip text-sm ${d === today ? 'bg-primary font-bold text-on-primary' : h || wd === 0 ? 'font-semibold text-danger' : wd === 6 ? 'text-primary' : past ? 'text-faint' : 'text-text'}`}>{i + 1}</span>
                  {h && <span className={`truncate rounded-button px-1 py-0.5 text-xs font-semibold ${tone(h.kind)}`}>{h.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <p className="num text-sm text-muted">{inMonth.length ? t('cal.monthCount', { n: inMonth.length }) : t('cal.monthNone')}</p>
      </div>

      {/* 고른 날짜 칸 */}
      <aside className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4 lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
        {!pick ? (
          <p className="text-sm text-muted">{t('cal.pickHint')}</p>
        ) : (
          <>
            <p className="num font-bold">{longDay(pick)}</p>
            {locked ? (
              <p className="text-sm text-faint">{t('cal.past')}</p>
            ) : picked ? (
              <>
                <p className="flex items-center gap-2">
                  <span className={`rounded-button px-2 py-0.5 text-sm font-semibold ${tone(picked.kind)}`}>{picked.label}</span>
                  <span className="text-sm text-muted">{t(picked.kind === 'company' ? 'kind.company' : 'kind.public')}</span>
                </p>
                {ask ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setAsk(false)}>{t('cancel')}</Button>
                    <button type="button" disabled={busy} onClick={async () => { if (await post({ action: 'holiday.remove', date: pick })) { setAsk(false); setPick(null); } }} className="min-h-11 flex-1 rounded-button bg-danger px-3 text-sm font-bold text-on-primary disabled:opacity-60">
                      {t('cal.removeConfirm')}
                    </button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setAsk(true)}>{t('cal.remove')}</Button>
                )}
              </>
            ) : (
              <form
                key={pick}
                className="flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await post({ action: 'holiday.add', date: pick, ...Object.fromEntries(new FormData(e.currentTarget)) })) setPick(null);
                }}
              >
                <label className="flex flex-col gap-1 text-sm text-muted">
                  {t('holidayLabel')}
                  <input name="label" required maxLength={40} autoFocus placeholder={t('cal.namePh')} className={field} autoComplete="off" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted">
                  {t('holidayKind')}
                  <Select name="kind" defaultValue="company" className={field}>
                    <option value="company">{t('kind.company')}</option>
                    <option value="public">{t('kind.public')}</option>
                  </Select>
                </label>
                <Button type="submit" disabled={busy}>{t('cal.add')}</Button>
              </form>
            )}
          </>
        )}
        {err && <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.settings" />}
      </aside>
    </div>
  );
}
