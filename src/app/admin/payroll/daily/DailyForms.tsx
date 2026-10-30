'use client';
// 일용직 화면의 조작부 (2026-10-28 급여-58로 다시 짬) — 대상자 등록 · 고치기(일반/외국인 · 매달 항목) · 고용 조건 고치기 · 삭제 · 사용 중지,
// 근무 여러 날짜 한 번에 넣기 · 고치기, 일용 대장 만들기 · 계산 · 검토 · 확정 · 정정, 최고관리자의 금액 조정. 처리하면 화면을 새로 읽는다.
import { Select } from '@/components/Select';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CLOSE_SHEET_EVENT } from '@/components/AddSheet';
import { Popup } from '@/components/Popup';
import { callApi } from '@/components/client-api';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';

const field = 'min-h-9 w-full rounded-button border border-border bg-bg px-3 text-sm';
const small = 'inline-flex h-8 items-center rounded-button border border-border bg-bg px-3 text-sm font-bold text-muted disabled:opacity-50';
// 저장 단추 줄 — 창 안에서 내려도 아래에 붙어 있다 (2026-10-29 검수: 폰에서 저장이 맨 아래에 숨었다)
const footer = 'sticky bottom-0 z-10 -mx-3 -mb-3 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-3 py-3 sm:col-span-2 lg:-mx-4 lg:-mb-4 lg:bg-bg lg:px-4';
const API = '/api/admin/payroll/daily';
type Err = { code: string; requestId?: string } | null;
const digits = (v: string) => v.replace(/[^\d]/g, '');
const closeSheet = (id: string) => window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: id }));

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err>(null);
  const send = async <T,>(body: Record<string, unknown>): Promise<T | null> => {
    setBusy(true);
    setErr(null);
    const r = await callApi<T>(API, body);
    setBusy(false);
    if (!r.ok) {
      setErr(r);
      return null;
    }
    router.refresh();
    return r.data;
  };
  return { busy, err, send, router };
}
const Fail = ({ err }: { err: Err }) => (err ? <ErrorNote code={err.code} requestId={err.requestId} namespace="admin.daily" /> : null);
const Label = ({ text, children, wide = false }: { text: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={`flex min-w-0 flex-col gap-1 text-sm ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="font-bold">{text}</span>
    {children}
  </label>
);

/** 창 안의 묶음 제목 — 「누구인가요 → 얼마를 주나요 → 더 보기」 순서로 읽히게 (2026-10-29) */
const Sec = ({ n, text }: { n?: number; text: string }) => (
  <p className="flex items-center gap-2 pt-1 text-sm font-extrabold sm:col-span-2">
    {n !== undefined && <span className="num flex size-5 items-center justify-center rounded-chip bg-primary-tint text-xs text-primary">{n}</span>}
    {text}
  </p>
);
const Req = () => <span className="text-danger"> *</span>;

// ── 대상자 ──
export type ItemOpt = { code: string; name: string; kind: 'PAYMENT' | 'DEDUCTION'; nontax: boolean; amount: number | null };
export type MonthlyRow = { code: string; label: string; kind: 'TAXABLE' | 'NONTAX' | 'DEDUCTION'; amount: number };
export type PayeeValue = { id?: string; name: string; workerKind: 'GENERAL' | 'FOREIGN'; nationality: string | null; visaType: string | null; stayUntil: string | null; jobTitle: string | null; phone: string | null; note: string | null; monthlyItems: MonthlyRow[] };
const NATIONS = ['VN', 'TH', 'CN', 'UZ', 'KH', 'NP', 'PH', 'ID', 'MN', 'MM', 'LK', 'BD', 'KZ', 'RU'] as const;
const VISAS = ['E-9', 'H-2', 'F-4', 'F-2', 'F-5', 'F-6', 'E-7', 'D-10', 'G-1'] as const;
const INS = ['AUTO', 'YES', 'NO'] as const;

/** 매달 항목 줄들 — 회사 항목(통합설정 › 급여 항목)에서 고르거나 이름을 직접 적는다 */
function MonthlyRows({ value, onChange, items }: { value: MonthlyRow[]; onChange: (v: MonthlyRow[]) => void; items: ItemOpt[] }) {
  const t = useTranslations('admin.daily');
  const set = (i: number, patch: Partial<MonthlyRow>) => onChange(value.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-bold">{t('m.title')}</span>
      <p className="text-xs text-faint">{t('m.hint')}</p>
      {value.map((r, i) => {
        const custom = !items.some((x) => x.code === r.code);
        return (
          <div key={i} className="flex flex-col gap-2 rounded-button border border-border p-2">
            <div className="flex items-center gap-2">
              <Select
                aria-label={t('m.pick')}
                value={custom ? 'CUSTOM' : r.code}
                onChange={(e) => {
                  const it = items.find((x) => x.code === e.target.value);
                  set(i, it ? { code: it.code, label: it.name, kind: it.kind === 'DEDUCTION' ? 'DEDUCTION' : it.nontax ? 'NONTAX' : 'TAXABLE', amount: r.amount || it.amount || 0 } : { code: 'CUSTOM' });
                }}
                className={`min-w-0 flex-1 ${field}`}
              >
                {items.map((x) => (
                  <option key={x.code} value={x.code}>{x.name} ({t(x.kind === 'DEDUCTION' ? 'item.DEDUCTION' : x.nontax ? 'item.NONTAX' : 'item.TAXABLE')})</option>
                ))}
                <option value="CUSTOM">{t('m.custom')}</option>
              </Select>
              <button type="button" aria-label={t('m.remove')} onClick={() => onChange(value.filter((_, k) => k !== i))} className="flex size-9 shrink-0 items-center justify-center rounded-button text-muted hover:bg-surface"><X aria-hidden size={18} /></button>
            </div>
            <div className={`grid gap-2 ${custom ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-2'}`}>
              {custom && <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} placeholder={t('itemLabel')} aria-label={t('itemLabel')} className={field} />}
              <Select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as MonthlyRow['kind'] })} aria-label={t('m.kind')} className={field}>
                {(['DEDUCTION', 'TAXABLE', 'NONTAX'] as const).map((k) => <option key={k} value={k}>{t(`item.${k}`)}</option>)}
              </Select>
              <input value={r.amount ? String(r.amount) : ''} onChange={(e) => set(i, { amount: Number(digits(e.target.value)) || 0 })} inputMode="numeric" placeholder={t('itemAmount')} aria-label={t('itemAmount')} className={`num ${field}`} />
            </div>
          </div>
        );
      })}
      <button type="button" className={`${small} self-start`} onClick={() => onChange([...value, items[0] ? { code: items[0].code, label: items[0].name, kind: items[0].kind === 'DEDUCTION' ? 'DEDUCTION' : items[0].nontax ? 'NONTAX' : 'TAXABLE', amount: items[0].amount ?? 0 } : { code: 'CUSTOM', label: '', kind: 'DEDUCTION', amount: 0 }])}>+ {t('m.add')}</button>
    </div>
  );
}

/** 고용 조건 칸 — 지급 기준 · 금액 · 기간 · 현장, 그 아래 세금 · 보험(자동/적용/제외) · 근거.
 *  2026-10-29 의뢰인(「처음 접하면 단추 하나하나가 불편하다」): 지급 기준을 먼저 고르면 금액 칸 이름이 「일당 · 시급 · 월급 · 건당」으로 바뀐다.
 *  세금 · 보험은 거의 바꾸지 않으므로 「모두 자동」 한 줄로 접어 두고, 직접 정한 값이 있거나 「모름」이면 펼친 채로 연다 */
function TermsFields({ withStart, values, basis: fixedBasis }: { withStart: boolean; basis?: 'DAY' | 'HOUR' | 'MONTH' | 'FIXED'; values?: { endsOn?: string | null; dayRate?: number | null; taxState?: string; ei?: string; np?: string; hi?: string; basisNote?: string | null } }) {
  const t = useTranslations('admin.daily');
  const [basis, setBasis] = useState<'DAY' | 'HOUR' | 'MONTH' | 'FIXED'>(fixedBasis ?? 'DAY');
  const [states, setStates] = useState({ ei: values?.ei ?? 'AUTO', np: values?.np ?? 'AUTO', hi: values?.hi ?? 'AUTO' });
  const [tax, setTax] = useState(values?.taxState && values.taxState !== 'UNKNOWN' ? values.taxState : 'DAILY');
  const manual = Object.values(states).some((v) => v === 'YES' || v === 'NO');
  const unknown = values?.taxState === 'UNKNOWN' || Object.values(states).some((v) => v === 'UNKNOWN');
  const allAuto = Object.values(states).every((v) => v === 'AUTO' || v === 'UNKNOWN');
  return (
    <>
      {withStart && (
        <fieldset className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
          <legend className="pb-1 font-bold">{t('eng.payBasis')}</legend>
          <input type="hidden" name="payBasis" value={basis} />
          <div className="grid grid-cols-2 gap-1 rounded-button border border-border p-0.5 sm:grid-cols-4">
            {(['DAY', 'HOUR', 'MONTH', 'FIXED'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={basis === k} onClick={() => setBasis(k)} className={`min-h-9 rounded-button px-2 text-sm font-bold ${basis === k ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface'}`}>{t(`basis.${k}`)}</button>
            ))}
          </div>
        </fieldset>
      )}
      <Label text={t(`eng.rate.${fixedBasis || withStart ? basis : 'ANY'}`)}>
        <input name="dayRate" inputMode="numeric" defaultValue={values?.dayRate ?? ''} onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num ${field}`} autoComplete="off" placeholder={t('eng.ratePh')} />
      </Label>
      {withStart && <Label text={t('eng.project')}><input name="project" maxLength={80} className={field} autoComplete="off" placeholder={t('noProject')} /></Label>}
      {withStart && <Label text={t('eng.startsOn')}><input type="date" name="startsOn" required defaultValue={`${new Date().toISOString().slice(0, 7)}-01`} className={field} /></Label>} {/* 이번 달 1일 — 오늘로 두면 그 앞 근무를 넣을 때 「고용 기간 밖」이 된다 */}
      <Label text={t('eng.endsOn')}><input type="date" name="endsOn" defaultValue={values?.endsOn ?? ''} className={field} /></Label>
      <details open={manual || unknown} className="group rounded-button border border-border sm:col-span-2">
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <b>{t('sec.tax')}</b>
          <span className="text-muted">{t(`tax.${tax}`)} · {allAuto ? t('sec.taxAuto') : t('sec.taxManual')}</span>
          <span className="ml-auto text-sm font-bold text-primary group-open:hidden">{t('sec.change')}</span>
        </summary>
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
          <Label text={t('eng.taxState')}>
            <Select name="taxState" value={tax} onChange={(e) => setTax(e.target.value)} className={field}>
              {(['DAILY', 'BUSINESS', 'NONE'] as const).map((k) => <option key={k} value={k}>{t(`tax.${k}`)}</option>)}
            </Select>
          </Label>
          {(['ei', 'np', 'hi'] as const).map((k) => (
            <Label key={k} text={t(`eng.${k}`)}>
              <Select name={k} value={states[k] === 'UNKNOWN' ? 'AUTO' : states[k]} onChange={(e) => setStates((s) => ({ ...s, [k]: e.target.value }))} className={field}>
                {INS.map((v) => <option key={v} value={v}>{t(`ins.${v}`)}</option>)}
              </Select>
            </Label>
          ))}
          {manual && <Label text={t('eng.basisNote')} wide><input name="basisNote" required minLength={2} maxLength={300} defaultValue={values?.basisNote ?? ''} className={field} autoComplete="off" placeholder={t('eng.basisHint')} /></Label>}
          <p className="text-xs text-faint sm:col-span-2">{t('insNote')}</p>
        </div>
      </details>
    </>
  );
}
const termsBody = (f: FormData) => ({ endsOn: f.get('endsOn') || '', dayRate: f.get('dayRate'), taxState: f.get('taxState'), ei: f.get('ei'), np: f.get('np'), hi: f.get('hi'), basisNote: f.get('basisNote') ?? '' });

/** 대상자 등록 · 고치기. 새로 등록할 때는 첫 고용 조건까지 한 번에 */
export function PayeeForm({ value, items, sheet }: { value?: PayeeValue; items: ItemOpt[]; sheet?: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [kind, setKind] = useState<'GENERAL' | 'FOREIGN'>(value?.workerKind ?? 'GENERAL');
  const [monthly, setMonthly] = useState<MonthlyRow[]>(value?.monthlyItems ?? []);
  const [done, setDone] = useState<string | null>(null);
  const editing = !!value?.id;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, f = new FormData(form);
        const bad = monthly.find((m) => !m.label.trim() || !m.amount);
        if (bad) return;
        const info = { name: f.get('name'), workerKind: kind, nationality: kind === 'FOREIGN' ? f.get('nationality') : null, visaType: kind === 'FOREIGN' ? f.get('visaType') : null, stayUntil: kind === 'FOREIGN' ? f.get('stayUntil') || null : null, jobTitle: f.get('jobTitle'), phone: f.get('phone'), note: f.get('note'), monthlyItems: monthly };
        const r = editing
          ? await send({ action: 'payee.update', id: value!.id, ...info })
          : await send<{ id: string; internalNo: string }>({ action: 'payee.add', internalNo: f.get('internalNo') ?? '', ...info, engagement: { startsOn: f.get('startsOn'), project: f.get('project') ?? '', payBasis: f.get('payBasis'), ...termsBody(f) } });
        if (r) {
          if (!editing) {
            form.reset();
            setMonthly([]);
            setDone(t('payeeDone', { no: (r as { internalNo: string }).internalNo }));
          }
          if (sheet) closeSheet(sheet);
        }
      }}
    >
      <Sec n={1} text={t('sec.who')} />
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-bold">{t('payee.name')}<Req /></span>
        <input name="name" required maxLength={60} defaultValue={value?.name ?? ''} className={field} autoComplete="off" placeholder={t('payee.namePh')} />
      </label>
      <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
        <legend className="pb-1 font-bold">{t('kind.title')}</legend>
        <div className="grid grid-cols-2 rounded-button border border-border p-0.5">
          {(['GENERAL', 'FOREIGN'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`min-h-8 rounded-button px-3 text-sm font-bold ${kind === k ? 'bg-primary text-on-primary' : 'text-muted'}`}>{t(`kind.${k}`)}</button>
          ))}
        </div>
      </fieldset>
      {kind === 'FOREIGN' && (
        <>
          <Label text={t('f.nationality')}>
            <Select name="nationality" required defaultValue={value?.nationality ?? 'VN'} className={field}>
              {NATIONS.map((n) => <option key={n} value={n}>{t(`nation.${n}`)}</option>)}
            </Select>
          </Label>
          <Label text={t('f.visa')}>
            <Select name="visaType" required defaultValue={value?.visaType ?? 'E-9'} className={field}>
              {VISAS.map((v) => <option key={v} value={v}>{v} · {t(`visa.${v.replace('-', '')}`)}</option>)}
            </Select>
          </Label>
          <Label text={t('f.stayUntil')}><input type="date" name="stayUntil" defaultValue={value?.stayUntil ?? ''} className={field} /></Label>
          <p className="self-end pb-2 text-xs text-faint">{t('f.hint')}</p>
        </>
      )}
      <Label text={t('payee.jobTitle')}><input name="jobTitle" maxLength={40} defaultValue={value?.jobTitle ?? ''} className={field} autoComplete="off" placeholder={t('payee.jobTitlePh')} /></Label>
      <Label text={t('payee.phone')}><input name="phone" maxLength={30} inputMode="tel" defaultValue={value?.phone ?? ''} className={field} autoComplete="off" placeholder="010-0000-0000" /></Label>
      {!editing && (
        <>
          <Sec n={2} text={t('sec.pay')} />
          <TermsFields withStart />
        </>
      )}
      {/* 자주 쓰지 않는 칸은 접어 둔다 — 매달 항목 · 내부번호 · 메모 (고치는 중이고 값이 있으면 펼친 채로) */}
      <details open={editing && (monthly.length > 0 || !!value?.note)} className="group rounded-button border border-border sm:col-span-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
          <b>{t('sec.more')}</b>
          <span className="truncate text-muted">{t('sec.moreHint')}</span>
          <ChevronDown aria-hidden size={16} className="ml-auto shrink-0 text-faint transition-transform duration-300 group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
          <MonthlyRows value={monthly} onChange={setMonthly} items={items} />
          {monthly.some((m) => !m.label.trim() || !m.amount) && <p className="text-xs text-warn sm:col-span-2">{t('m.incomplete')}</p>}
          {!editing && <Label text={t('payee.internalNoAuto')}><input name="internalNo" maxLength={30} className={field} autoComplete="off" placeholder={t('payee.internalNoPh')} /></Label>}
          <Label text={t('payee.note')} wide={editing}><input name="note" maxLength={300} defaultValue={value?.note ?? ''} className={field} autoComplete="off" /></Label>
        </div>
      </details>
      <p className="text-xs text-faint sm:col-span-2">{t('payeeNote')}</p>
      <div className={footer}>
        <Button type="submit" disabled={busy} className="min-w-32 flex-1 sm:flex-none">{editing ? t('save') : t('payeeAdd')}</Button>
        {done && <span role="status" className="text-sm text-ok">{done}</span>}
        <Fail err={err} />
      </div>
    </form>
  );
}

export function EngagementAddForm({ payeeId, sheet }: { payeeId: string; sheet?: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (await send({ action: 'engagement.add', payeeId, startsOn: f.get('startsOn'), project: f.get('project') ?? '', payBasis: f.get('payBasis'), ...termsBody(f) })) if (sheet) closeSheet(sheet);
      }}
    >
      <TermsFields withStart />
      <div className={footer}>
        <Button type="submit" size="sm" disabled={busy}>{t('save')}</Button>
        <Fail err={err} />
      </div>
    </form>
  );
}
export function EngagementEditForm({ id, values, sheet, basis }: { id: string; sheet?: string; basis?: 'DAY' | 'HOUR' | 'MONTH' | 'FIXED'; values: { endsOn: string | null; dayRate: number | null; taxState: string; ei: string; np: string; hi: string; basisNote: string | null } }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send({ action: 'engagement.set', id, ...termsBody(new FormData(e.currentTarget)) })) if (sheet) closeSheet(sheet);
      }}
    >
      <TermsFields withStart={false} basis={basis} values={values} />
      <div className={footer}>
        <Button type="submit" size="sm" disabled={busy}>{t('save')}</Button>
        <button type="button" className={small} disabled={busy} onClick={async () => { if (await send({ action: 'engagement.set', id, disable: true })) if (sheet) closeSheet(sheet); }}>{t('engOff')}</button>
        <Fail err={err} />
      </div>
    </form>
  );
}

/** 사용 중지 · 다시 사용 · 지우기(기록이 없을 때만) — 자주 쓰지 않으므로 「⋯」 안에 (2026-10-29 검수) */
export function PayeeActions({ id, active, name, deletable }: { id: string; active: boolean; name: string; deletable: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  return (
    <span className="relative flex flex-col items-end gap-1">
      <button type="button" className="flex size-8 items-center justify-center rounded-button text-muted hover:bg-surface" aria-label={t('moreOf', { name })} aria-expanded={open} onClick={() => { setOpen(!open); setAsk(false); }}>
        <MoreHorizontal aria-hidden size={18} />
      </button>
      {open && (
        <span className="absolute top-9 right-0 z-20 flex min-w-44 flex-col gap-1 rounded-card border border-border bg-bg p-1.5 shadow-hover">
          <button type="button" className="min-h-9 rounded-button px-3 text-left text-sm hover:bg-surface" disabled={busy} onClick={() => send({ action: 'payee.active', id, active: !active })} aria-label={t(active ? 'payeeOffOf' : 'payeeOnOf', { name })}>{t(active ? 'payeeOff' : 'payeeOn')}</button>
          {deletable ? (ask ? (
            <span className="flex flex-col gap-1.5 px-3 py-1.5">
              <span className="text-xs text-warn">{t('deleteAsk', { name })}</span>
              <span className="flex gap-2">
                <button type="button" className={`${small} text-warn`} disabled={busy} onClick={() => send({ action: 'payee.delete', id })}>{t('deleteYes')}</button>
                <button type="button" className={small} onClick={() => setAsk(false)}>{t('cancel')}</button>
              </span>
            </span>
          ) : (
            <button type="button" className="min-h-9 rounded-button px-3 text-left text-sm text-warn hover:bg-surface" onClick={() => setAsk(true)} aria-label={t('deleteOf', { name })}>{t('delete')}</button>
          )) : <span className="px-3 pb-1 text-xs text-faint">{t('noDelete')}</span>}
        </span>
      )}
      <Fail err={err} />
    </span>
  );
}

/** 대상자 이름 · 내부번호로 찾기 — 목록에서 맞지 않는 사람을 숨긴다(이 화면 안에서만) */
export function PayeeSearch() {
  const t = useTranslations('admin.daily');
  return (
    <input
      type="search"
      placeholder={t('search')}
      aria-label={t('search')}
      className="h-9 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 text-sm sm:max-w-64"
      onInput={(e) => {
        const q = e.currentTarget.value.trim().toLowerCase();
        document.querySelectorAll<HTMLElement>('[data-payee-name]').forEach((el) => {
          el.hidden = !!q && !(el.dataset.payeeName ?? '').toLowerCase().includes(q);
        });
      }}
    />
  );
}

/** 근무 화면의 대상자 고르기 — 고르면 바로 그 사람만 (「보기」 단추 없이) */
export function WorkPayeeFilter({ payees, value, month, live }: { payees: { id: string; name: string }[]; value: string | null; month: string; live?: boolean }) {
  const t = useTranslations('admin.daily');
  const router = useRouter();
  return (
    <select
      defaultValue={value ?? ''}
      aria-label={t('filterPayee')}
      className="h-9 min-w-0 flex-1 rounded-button border border-border bg-bg px-2 text-sm sm:max-w-56 sm:flex-none"
      onChange={(e) => router.push(`/admin/payroll/daily?v=work&m=${month}${e.target.value ? `&p=${e.target.value}` : ''}${live ? '&live=1' : ''}`)}
    >
      <option value="">{t('allPayees')}</option>
      {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

// ── 근무 ──
type PayeeOpt = { id: string; name: string; internalNo: string; projects: { project: string; basis: 'DAY' | 'HOUR' | 'MONTH' | 'FIXED'; rate: number | null }[] };
const QTY = { DAY: { max: 3, step: '0.25' }, HOUR: { max: 744, step: '0.25' }, MONTH: { max: 12, step: '1' }, FIXED: { max: 100, step: '1' } } as const;
type ItemRow = { kind: 'TAXABLE' | 'NONTAX' | 'DEDUCTION'; label: string; amount: number };
function ItemRows({ value, onChange }: { value: ItemRow[]; onChange: (v: ItemRow[]) => void }) {
  const t = useTranslations('admin.daily');
  const set = (i: number, p: Partial<ItemRow>) => onChange(value.map((r, k) => (k === i ? { ...r, ...p } : r)));
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="text-sm font-bold">{t('w.items')}</span>
      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <Select value={r.kind} onChange={(e) => set(i, { kind: e.target.value as ItemRow['kind'] })} aria-label={t('m.kind')} className={field}>
            {(['TAXABLE', 'NONTAX', 'DEDUCTION'] as const).map((k) => <option key={k} value={k}>{t(`item.${k}`)}</option>)}
          </Select>
          <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={40} placeholder={t('itemLabel')} aria-label={t('itemLabel')} className={field} />
          <input value={r.amount ? String(r.amount) : ''} onChange={(e) => set(i, { amount: Number(digits(e.target.value)) || 0 })} inputMode="numeric" placeholder={t('itemAmount')} aria-label={t('itemAmount')} className={`num ${field}`} />
          <button type="button" className={small} onClick={() => onChange(value.filter((_, k) => k !== i))}>{t('m.remove')}</button>
        </div>
      ))}
      <button type="button" className={`${small} self-start`} onClick={() => onChange([...value, { kind: 'TAXABLE', label: '', amount: 0 }])}>+ {t('w.addItem')}</button>
    </div>
  );
}

/** 달력에서 여러 날짜를 고른다 — 평일 전체 · 모두 해제 */
function DatePicker({ month, value, onChange }: { month: string; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations('admin.daily');
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const all = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const weekday = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const on = new Set(value);
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">{t('w.dates', { n: value.length })}</span>
        <button type="button" className={small} onClick={() => onChange(all.filter(weekday))}>{t('w.weekdays')}</button>
        <button type="button" className={small} onClick={() => onChange([])}>{t('w.clear')}</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => <span key={d} className="text-faint">{t(`dow.${d}`)}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
        {all.map((d) => (
          <button key={d} type="button" aria-pressed={on.has(d)} onClick={() => onChange(on.has(d) ? value.filter((x) => x !== d) : [...value, d])} className={`num min-h-9 rounded-button border text-sm ${on.has(d) ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg'}`}>
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 근무 넣기 — 대상자 · 현장 · 날짜 여러 개 · 수량 · 단가 · 항목. 기본은 바로 확정 */
export function WorkAdd({ payees, month, live, preset, sheet }: { payees: PayeeOpt[]; month: string; live?: boolean; preset?: string; sheet?: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [payeeId, setPayeeId] = useState(preset ?? '');
  const [project, setProject] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const picked = payees.find((p) => p.id === payeeId);
  const proj = picked?.projects.find((p) => p.project === (project ?? picked.projects[0]?.project)) ?? picked?.projects[0];
  const basis = proj?.basis ?? 'DAY';
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!dates.length || items.some((i) => !i.label.trim() || !i.amount)) return;
        const f = new FormData(e.currentTarget);
        const r = await send<{ added: string[]; skipped: { date: string; code: string }[] }>({ action: 'work.add', payeeId, workDates: dates, project: proj?.project ?? '', segmentKey: f.get('segmentKey') || 'A', quantity: Number(f.get('quantity')), dayRate: f.get('dayRate'), items, basisNote: f.get('basisNote'), confirm: f.get('confirm') === 'on', ...(live ? { live: true } : {}) });
        if (r) {
          setMsg(t('w.done', { n: r.added.length }) + (r.skipped.length ? ` · ${t('w.skipped', { list: r.skipped.map((s) => `${s.date.slice(5)} ${t(`skip.${s.code}`)}`).join(', ') })}` : ''));
          setDates([]);
          if (sheet && !r.skipped.length) closeSheet(sheet);
        }
      }}
    >
      {preset && picked && picked.projects.length <= 1 ? (
        <p className="num rounded-button bg-surface px-3 py-2 text-sm font-bold sm:col-span-2">
          {[picked.name, proj?.project, proj ? `${t(`basis.${proj.basis}`)} ${proj.rate === null ? t('noRate') : proj.rate.toLocaleString('ko-KR')}` : null].filter(Boolean).join(' · ')}
        </p>
      ) : (
      <>
      <Label text={t('work.payee')}>
        <Select required value={payeeId} onChange={(e) => { setPayeeId(e.target.value); setProject(null); }} className={field}>
          <option value="">{t('pick')}</option>
          {payees.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.internalNo})</option>)}
        </Select>
      </Label>
      <Label text={t('work.project')}>
        <Select value={proj?.project ?? ''} onChange={(e) => setProject(e.target.value)} className={field} disabled={!picked}>
          {!picked?.projects.length && <option value="">{picked ? t('w.noEngagement') : t('noProject')}</option>}
          {picked?.projects.map((p) => <option key={p.project} value={p.project}>{(p.project || t('noProject')) + ` · ${t(`basis.${p.basis}`)}`}</option>)}
        </Select>
      </Label>
      </>
      )}
      <DatePicker month={month} value={dates} onChange={setDates} />
      <Label text={t(`qty.${basis}`)}><input key={basis} name="quantity" type="number" step={QTY[basis].step} min={QTY[basis].step} max={QTY[basis].max} defaultValue={basis === 'HOUR' ? '8' : '1'} required className={`num ${field}`} /></Label>
      <Label text={t('work.unitRate')}><input name="dayRate" inputMode="numeric" placeholder={proj?.rate ? String(proj.rate) : ''} onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num ${field}`} autoComplete="off" /></Label>
      <ItemRows value={items} onChange={setItems} />
      <Label text={t('work.basis')}><input name="basisNote" maxLength={300} className={field} autoComplete="off" /></Label>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{t('w.more')}</summary>
        <Label text={t('work.segment')}><input name="segmentKey" maxLength={10} defaultValue="A" className={field} autoComplete="off" /></Label>
        <p className="pt-1 text-xs text-faint">{t('w.segmentHint')}</p>
      </details>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirm" defaultChecked className="size-4" />{t('w.confirmNow')}</label>
      <div className={footer}>
        <Button type="submit" size="sm" disabled={busy || !payeeId || !dates.length}>{t('w.add', { n: dates.length })}</Button>
        {msg && <span role="status" className="text-sm text-ok">{msg}</span>}
        <Fail err={err} />
      </div>
    </form>
  );
}

/** 근무 한 줄 — 고치기(확정한 줄은 무효로 하고 새 줄, 창으로) · 확정 · 무효. PC는 단추가 줄 끝에, 폰은 「⋯」 안에 (2026-10-29 검수) */
export function WorkControls({ id, version, status, label, values }: { id: string; version: number; status: string; label: string; values: { quantity: number; dayRate: number; items: ItemRow[]; basisNote: string | null } }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const [items, setItems] = useState<ItemRow[]>(values.items);
  const [more, setMore] = useState(false);
  if (status === 'VOID') return null;
  const sheet = `work-${id}`;
  const buttons = (
    <>
      <Popup id={sheet} label={t('w.edit')} title={label} triggerClass={small}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (items.some((i) => !i.label.trim() || !i.amount)) return;
            const f = new FormData(e.currentTarget);
            if (await send({ action: 'work.edit', id, expectedVersion: version, quantity: Number(f.get('quantity')), dayRate: f.get('dayRate'), items, basisNote: f.get('basisNote') })) closeSheet(sheet);
          }}
        >
          <Label text={t('wQty')}><input name="quantity" type="number" step="0.25" min="0.25" max="744" defaultValue={values.quantity} required className={`num ${field}`} /></Label>
          <Label text={t('wRate')}><input name="dayRate" inputMode="numeric" defaultValue={values.dayRate} onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num ${field}`} /></Label>
          <ItemRows value={items} onChange={setItems} />
          <Label text={t('work.basis')} wide><input name="basisNote" maxLength={300} defaultValue={values.basisNote ?? ''} className={field} /></Label>
          <p className="text-xs text-faint sm:col-span-2">{t(status === 'CONFIRMED' ? 'w.editConfirmed' : 'w.editDraft')}</p>
          <div className={footer}>
            <Button type="submit" size="sm" disabled={busy}>{t('save')}</Button>
            <Fail err={err} />
          </div>
        </form>
      </Popup>
      {status === 'DRAFT' && <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'work.status', id, expectedVersion: version, status: 'CONFIRMED' })}>{t('workConfirm')}</button>}
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'work.status', id, expectedVersion: version, status: 'VOID' })}>{t('workVoid')}</button>
    </>
  );
  // PC에서도 「⋯」 안에 — 한 달 20줄 넘게 「고치기 · 무효」가 줄마다 보이면 날짜 · 금액이 묻힌다 (2026-10-29 의뢰인)
  return (
    <span className="flex flex-col items-end gap-1" aria-label={label}>
      <button type="button" className="flex size-8 items-center justify-center rounded-button text-muted hover:bg-surface" aria-label={t('moreOf', { name: label })} aria-expanded={more} onClick={() => setMore(!more)}>
        <MoreHorizontal aria-hidden size={18} />
      </button>
      {more && <span className="flex items-center gap-2">{buttons}</span>}
      <Fail err={err} />
    </span>
  );
}

/** 이 달의 미확정 줄을 한 번에 확정 */
export function ConfirmAll({ rows }: { rows: { id: string; version: number }[] }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  if (!rows.length) return null;
  return (
    <span className="flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => { for (const r of rows) if (!(await send({ action: 'work.status', id: r.id, expectedVersion: r.version, status: 'CONFIRMED' }))) break; }}>{t('w.confirmAll', { n: rows.length })}</Button>
      <Fail err={err} />
    </span>
  );
}

// ── 일용 대장 ──
export function DailyRunCreate({ month, payDate, live }: { month: string; payDate: string; live?: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send, router } = useCall();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const made = await send<{ id: string }>({ action: 'run.create', month: f.get('month'), payDate: f.get('payDate'), ...(live ? { live: true } : {}) });
        if (made) router.push(`/admin/payroll/daily/runs/${made.id}`);
      }}
    >
      <Label text={t('run.month')}><input type="month" name="month" required defaultValue={month} className={field} /></Label>
      <Label text={t('run.payDate')}><input type="date" name="payDate" required defaultValue={payDate} className={field} /></Label>
      <div className={footer}>
        <Button type="submit" size="sm" disabled={busy}>{t('runCreate')}</Button>
        <Fail err={err} />
      </div>
    </form>
  );
}

export function DailyRunActions({ id, version, status, stale, blocked, latest }: { id: string; version: number; status: string; stale: boolean; blocked: number; latest: boolean }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send, router } = useCall();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (status === 'FINALIZED') {
    if (!latest) return null;
    // 확정한 대장 고치기 — 원본은 그대로 두고 정정 판을 만든다 (2026-10-14)
    return (
      <div className="flex flex-col gap-2 text-sm">
        {ask ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('correctReason')} aria-label={t('correctReason')} className="h-9 min-w-0 flex-1 rounded-button border border-border bg-bg px-3 sm:max-w-md" />
            <Button type="button" size="sm" disabled={busy || reason.trim().length < 2} onClick={async () => { const r = await send<{ id: string }>({ action: 'run.correct', id, reason }); if (r) router.push(`/admin/payroll/daily/runs/${r.id}`); }}>{t('correctStart')}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAsk(false)}>{t('cancel')}</Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setAsk(true)}>{t('correct')}</Button>
        )}
        <p className="text-xs text-faint">{t('correctHint')}</p>
        <Fail err={err} />
      </div>
    );
  }
  const base = { id, expectedVersion: version };
  const canFinalize = status === 'REVIEWED' && !stale && blocked === 0;
  // 확정은 되돌릴 수 없다 — 다른 단추를 치우고 확인 상자만 보인다 (키트: 비가역 행동은 확인 창이 먼저)
  if (ask) {
    return (
      <div role="alertdialog" aria-labelledby={`fin-${id}`} className="flex w-full flex-col gap-3 rounded-card border border-warn bg-warn-tint p-4 text-sm sm:w-auto">
        <p id={`fin-${id}`} className="font-bold text-warn">{t('finalizeConfirm')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={async () => { await send({ action: 'run.finalize', ...base }); setAsk(false); }}>{t('finalizeYes')}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setAsk(false)}>{t('cancel')}</Button>
        </div>
        <Fail err={err} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* 지금 할 일 하나만 진하게, 아직 할 수 없는 단계는 보이지 않게 (2026-10-29 의뢰인: 단추 셋이 같은 모양이라 어디까지 왔는지 모른다) */}
        {(status === 'CALCULATED' && !stale && blocked === 0) && <Button type="button" disabled={busy} onClick={() => send({ action: 'run.review', ...base })}>{t('review')}</Button>}
        <Button type="button" size={status === 'DRAFT' || stale ? undefined : 'sm'} variant={status === 'DRAFT' || stale || blocked > 0 ? undefined : 'outline'} disabled={busy} onClick={async () => { setMsg(null); const r = await send<{ calculated: { ok: number; blocked: number } }>({ action: 'run.calculate', ...base }); if (r) setMsg(t('calcDone', r.calculated)); }}>
          {t(status === 'DRAFT' ? 'calculate' : 'recalculate')}
        </Button>
        {canFinalize && <Button type="button" disabled={busy} className="order-first" onClick={() => setAsk(true)}>{t('finalize')}</Button>}
      </div>
      {msg && <p role="status" className="text-ok">{msg}</p>}
      <Fail err={err} />
    </div>
  );
}

/** 최고관리자의 금액 조정 — 보험 · 세금 금액 바꾸기, 지급 · 공제 항목 더하기. 넣은 뒤 「다시 계산」해야 반영된다 */
export function AdjustForm({ runId, payeeId, autos, items }: { runId: string; payeeId: string; autos: { code: string; label: string; amount: number }[]; items: ItemOpt[] }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  const opts = useMemo(() => [
    ...autos.map((a) => ({ value: a.code, label: `${a.label} — ${t('adj.now', { n: a.amount.toLocaleString('ko-KR') })}`, kind: 'DEDUCTION' as const, auto: true, name: a.label })),
    ...items.map((i) => ({ value: i.code, label: `${i.name} (${t(i.kind === 'DEDUCTION' ? 'item.DEDUCTION' : 'adj.payment')})`, kind: i.kind, auto: false, name: i.name })),
    { value: 'CUSTOM_DEDUCTION', label: t('adj.customDeduction'), kind: 'DEDUCTION' as const, auto: false, name: '' },
    { value: 'CUSTOM_PAYMENT', label: t('adj.customPayment'), kind: 'PAYMENT' as const, auto: false, name: '' },
  ], [autos, items, t]);
  const [pick, setPick] = useState(opts[0]?.value ?? 'CUSTOM_DEDUCTION');
  const o = opts.find((x) => x.value === pick) ?? opts[0];
  const custom = pick.startsWith('CUSTOM_');
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget, f = new FormData(form);
        const label = custom ? String(f.get('label') ?? '') : o.name;
        const code = custom ? `ADJ_${Date.now().toString(36).toUpperCase()}` : o.value;
        if (await send({ action: 'adjust.add', runId, payeeId, code, label, kind: o.kind, amount: Number(digits(String(f.get('amount') ?? ''))), reason: f.get('reason') })) form.reset();
      }}
    >
      <Label text={t('adj.item')} wide>
        <Select value={pick} onChange={(e) => setPick(e.target.value)} className={field}>
          {opts.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
      </Label>
      {custom && <Label text={t('itemLabel')}><input name="label" required maxLength={40} className={field} autoComplete="off" /></Label>}
      <Label text={t(o.auto ? 'adj.newAmount' : 'itemAmount')}><input name="amount" required inputMode="numeric" onInput={(e) => { e.currentTarget.value = digits(e.currentTarget.value); }} className={`num ${field}`} autoComplete="off" /></Label>
      <Label text={t('adj.reason')} wide><input name="reason" required minLength={2} maxLength={300} className={field} autoComplete="off" /></Label>
      <p className="text-xs text-faint sm:col-span-2">{t('adj.hint')}</p>
      <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{t('adj.save')}</Button></div>
      <div className="sm:col-span-2"><Fail err={err} /></div>
    </form>
  );
}
export function AdjustRemove({ id }: { id: string }) {
  const t = useTranslations('admin.daily');
  const { busy, err, send } = useCall();
  return (
    <span className="flex flex-col gap-1">
      <button type="button" className={small} disabled={busy} onClick={() => send({ action: 'adjust.remove', id })}>{t('adj.remove')}</button>
      <Fail err={err} />
    </span>
  );
}
