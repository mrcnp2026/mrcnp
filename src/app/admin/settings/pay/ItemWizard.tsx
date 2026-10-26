'use client';
// 지급 · 공제 항목 등록 안내 (2026-10-22 의뢰인: 초보 사용자도 코드 · 용어 없이 등록).
// 질문에 하나씩 답하면 코드 · 영어 이름 · 계산 방식 · 과세 · 통상임금 칸을 알아서 채운다. 자세한 칸은 「직접 입력」(ItemForm)에서.
// 2026-10-22 의뢰인: 「등록 누르면 UX/UI가 너무 이상하다(모바일도)」 → 목록 사이에 끼워 넣지 않고 팝업(폰은 아래에서 올라오는 창)으로 띄운다.
//   이전 · 다음은 창 아래에 붙어 있어 어느 단계에서나 보이고, 글자는 크게 한다.
import { ListPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddSheet, CLOSE_SHEET_EVENT, OPEN_SHEET_EVENT } from '@/components/AddSheet';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/ui';
import { DED_PICKS, guessTax, PAY_PICKS, type ItemPick } from '@/lib/payroll/item-picks';
import { field, ItemForm, NS, usePost } from './PayForms';

type Calc = ItemPick['calc'];
type Draft = { ko: string; en: string; calc: Calc; amount: string; tax: 'TAXABLE' | 'EXEMPT' | 'PARTIAL'; limit: string; regular: 'YES' | 'NO' | 'UNSURE'; from: string };
const SHEET = 'item-wizard';

function Choice({ on, title, text, onPick }: { on: boolean; title: string; text?: string; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className={`flex min-h-14 w-full flex-col items-start justify-center gap-0.5 rounded-card border-2 px-4 py-3 text-left ${on ? 'border-primary bg-primary-tint' : 'border-border bg-bg'}`}>
      <span className="text-base font-bold">{title}</span>
      {text && <span className="text-sm font-normal text-muted">{text}</span>}
    </button>
  );
}

function Wizard({ kind, today, onAdvanced, onClose }: { kind: 'PAYMENT' | 'DEDUCTION'; today: string; onAdvanced: () => void; onClose: () => void }) {
  const t = useTranslations('admin.paySettings');
  const w = (k: string, v?: Record<string, string | number>) => t(`wiz.${k}`, v);
  const { busy, err, done, post } = usePost();
  const pay = kind === 'PAYMENT';
  const steps = pay ? ['pick', 'name', 'how', 'tax', 'regular', 'confirm'] : ['pick', 'name', 'how', 'confirm'];
  const blank: Draft = { ko: '', en: '', calc: 'FIXED', amount: '', tax: 'TAXABLE', limit: '', regular: 'NO', from: today.slice(0, 4) + '-01-01' };
  const [i, setI] = useState(0);
  const [d, setD] = useState<Draft>(blank);
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const step = steps[i];
  const ready = step === 'name' ? d.ko.trim().length > 0 : step === 'tax' ? d.tax !== 'PARTIAL' || /^[0-9,]+$/.test(d.limit) : step === 'confirm' ? /^\d{4}-\d{2}-\d{2}$/.test(d.from) : true;
  const picks = pay ? PAY_PICKS : DED_PICKS;
  const calcs: Calc[] = pay ? ['FIXED', 'MANUAL', 'TIME'] : ['FIXED', 'MANUAL'];
  const won = (n: string) => `${n}${w('won')}`;
  const guess = pay ? guessTax(d.ko) : null; // 이름으로 짐작한 과세 구분 — 추천일 뿐, 고르는 건 사람 (2026-10-26)
  const q = 'text-lg font-bold';
  const hint = 'text-sm text-muted';

  const submit = async () => {
    const body = {
      kind,
      code: `X_${Date.now().toString(36).toUpperCase()}`, // 코드는 사람이 정하지 않는다
      koName: d.ko.trim(),
      enName: d.en.trim() || d.ko.trim(),
      calcKind: d.calc,
      defaultAmount: d.calc === 'FIXED' ? d.amount : '',
      fixedAllowance: pay && d.regular === 'YES',
      taxTreatment: pay ? d.tax : 'NOT_APPLICABLE',
      taxExemptLimit: pay && d.tax === 'PARTIAL' ? d.limit : '',
      ordinaryWage: !pay ? 'EXCLUDED' : d.regular === 'YES' ? 'INCLUDED' : d.regular === 'NO' ? 'EXCLUDED' : 'UNKNOWN',
      sort: 500,
      validFrom: d.from,
      reason: '',
      expectedVersion: 0,
    };
    if (await post('/api/admin/payroll/items', body)) setSaved(true);
  };

  if (saved && done) {
    return (
      <div className="flex flex-col gap-4 py-2">
        <p role="status" className="text-lg font-bold text-ok">{w('registered', { name: d.ko })}</p>
        <div className="flex flex-col gap-2 lg:flex-row">
          <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => { setD(blank); setI(0); setSaved(false); }}>{w('another')}</Button>
          <Button type="button" className="min-h-11 flex-1" onClick={onClose}>{w('close')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-sm font-bold text-primary">{w('step', { n: i + 1, total: steps.length })}</span>
        <span className="flex flex-1 gap-1" aria-hidden>
          {steps.map((s, k) => <span key={s} className={`h-1.5 flex-1 rounded-chip ${k <= i ? 'bg-primary' : 'bg-border'}`} />)}
        </span>
      </div>

      {step === 'pick' && (
        <>
          <div className="flex flex-col gap-1">
            <p className={q}>{w('pickQ')}</p>
            <p className={hint}>{w('pickHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {picks.map((p) => (
              <button key={p.ko} type="button" className="min-h-12 rounded-card border-2 border-border bg-bg px-3 text-base font-bold active:bg-primary-tint" onClick={() => { set({ ko: p.ko, en: p.en, calc: p.calc, tax: p.tax ?? 'TAXABLE', limit: p.limit ?? '', regular: p.regular ?? 'NO' }); setI(1); }}>
                {p.ko}
                {pay && <span className={`block text-xs font-normal ${p.tax === 'PARTIAL' ? 'text-primary' : 'text-muted'}`}>{t(`tax.${p.tax ?? 'TAXABLE'}`)}{p.limit ? ` · ${t('item.limitOf', { amount: won(p.limit) })}` : ''}</span>}
              </button>
            ))}
          </div>
          <Button type="button" className="min-h-12 w-full text-base" onClick={() => { setD(blank); setI(1); }}>{w('own')}</Button>
        </>
      )}

      {step === 'name' && (
        <>
          <div className="flex flex-col gap-1">
            <p className={q}>{w('nameQ')}</p>
            <p className={hint}>{w('nameHint')}</p>
          </div>
          <input value={d.ko} onChange={(e) => set({ ko: e.target.value })} maxLength={60} autoComplete="off" placeholder={pay ? w('namePlacePay') : w('namePlaceDed')} className={`${field} min-h-12 text-base`} />
          <label className="flex flex-col gap-1">
            <span className="text-base font-bold">{w('en')}</span>
            <input value={d.en} onChange={(e) => set({ en: e.target.value })} maxLength={60} autoComplete="off" className={`${field} min-h-12 text-base`} />
            <span className={hint}>{w('enHint')}</span>
          </label>
        </>
      )}

      {step === 'how' && (
        <>
          <p className={q}>{pay ? w('howQPay') : w('howQDed')}</p>
          <div role="radiogroup" className="flex flex-col gap-2">
            {calcs.map((k) => <Choice key={k} on={d.calc === k} title={w(`how.${k}`)} text={w(`how.${k}d`)} onPick={() => set({ calc: k })} />)}
          </div>
          {d.calc === 'FIXED' && (
            <label className="flex flex-col gap-1">
              <span className="text-base font-bold">{w('amount')}</span>
              <input value={d.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="numeric" pattern="[0-9,]*" autoComplete="off" className={`num ${field} min-h-12 text-base`} />
              <span className={hint}>{w('amountHint')}</span>
            </label>
          )}
        </>
      )}

      {step === 'tax' && (
        <>
          <p className={q}>{w('taxQ')}</p>
          {guess && <p className="rounded-card bg-primary-tint px-4 py-3 text-sm">{w('taxRec', { name: d.ko, tax: t(`tax.${guess.tax}`) })}</p>}
          <div role="radiogroup" className="flex flex-col gap-2">
            {(['TAXABLE', 'EXEMPT', 'PARTIAL'] as const).map((k) => <Choice key={k} on={d.tax === k} title={`${w(`tax.${k}`)}${guess?.tax === k ? ` · ${w('recChip')}` : ''}`} text={w(`tax.${k}d`)} onPick={() => set({ tax: k, limit: k === 'PARTIAL' && !d.limit && guess?.limit ? guess.limit : d.limit })} />)}
            <Choice on={false} title={w('tax.UNSURE')} text={w('tax.UNSUREd')} onPick={() => { set({ tax: 'TAXABLE', limit: '' }); setI(i + 1); }} />
          </div>
          {d.tax === 'PARTIAL' && (
            <label className="flex flex-col gap-1">
              <span className="text-base font-bold">{w('limit')}</span>
              <input value={d.limit} onChange={(e) => set({ limit: e.target.value })} inputMode="numeric" pattern="[0-9,]*" autoComplete="off" className={`num ${field} min-h-12 text-base`} />
              <span className={hint}>{w('limitHint')}</span>
            </label>
          )}
        </>
      )}

      {step === 'regular' && (
        <>
          <div className="flex flex-col gap-1">
            <p className={q}>{w('regularQ')}</p>
            <p className={hint}>{w('regularHint')}</p>
          </div>
          <div role="radiogroup" className="flex flex-col gap-2">
            {(['YES', 'NO', 'UNSURE'] as const).map((k) => <Choice key={k} on={d.regular === k} title={w(`reg.${k}`)} text={w(`reg.${k}d`)} onPick={() => set({ regular: k })} />)}
          </div>
        </>
      )}

      {step === 'confirm' && (
        <>
          <p className={q}>{w('confirmQ')}</p>
          <dl className="flex flex-col gap-2 rounded-card bg-bg px-4 py-3 text-base">
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('item.koName')}</dt><dd className="text-right font-bold">{d.ko}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{t('item.calcKind')}</dt><dd className="text-right font-bold">{w(`how.${d.calc}`)}{d.calc === 'FIXED' && d.amount ? ` · ${won(d.amount)}` : ''}</dd></div>
            {pay && <div className="flex justify-between gap-3"><dt className="text-muted">{t('item.tax')}</dt><dd className="text-right font-bold">{t(`tax.${d.tax}`)}{d.tax === 'PARTIAL' ? ` · ${won(d.limit)}` : ''}</dd></div>}
            {pay && <div className="flex justify-between gap-3"><dt className="text-muted">{t('item.ordinary')}</dt><dd className="text-right font-bold">{t(`ordinary.${d.regular === 'YES' ? 'INCLUDED' : d.regular === 'NO' ? 'EXCLUDED' : 'UNKNOWN'}`)}</dd></div>}
          </dl>
          {pay && d.regular === 'UNSURE' && <p className="text-sm text-warn">{w('unsureWarn')}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-base font-bold">{t('validFrom')}</span>
            <input type="date" value={d.from} onChange={(e) => set({ from: e.target.value })} className={`num ${field} min-h-12 text-base lg:max-w-56`} />
            <span className={hint}>{w('fromHint')}</span>
          </label>
        </>
      )}

      {err && <ErrorNote code={err.code} requestId={err.requestId} namespace={NS} />}

      {step === 'pick' ? (
        <button type="button" onClick={onAdvanced} className="self-start text-sm font-bold text-primary underline">{w('advanced')}</button>
      ) : (
        <div className="sticky bottom-0 -mx-3 flex gap-2 border-t border-border bg-surface px-3 pt-3 pb-3">
          <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setI(i - 1)}>{w('prev')}</Button>
          {step === 'confirm' ? (
            <Button type="button" className="min-h-12 flex-[2]" disabled={busy || !ready} onClick={submit}>{t('add')}</Button>
          ) : (
            <Button type="button" className="min-h-12 flex-[2]" disabled={!ready} onClick={() => { if (pay && step === 'name' && d.tax === 'TAXABLE' && guess?.tax === 'PARTIAL') set({ tax: 'PARTIAL', limit: guess.limit ?? '' }); setI(i + 1); }}>{w('next')}</Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 「+ 등록」 단추와 그 팝업 — 질문에 답하는 안내가 기본, 「직접 입력」은 같은 팝업 안에서 바꿔 본다 */
export function ItemAdd({ kind, today, defaultOpen = false }: { kind: 'PAYMENT' | 'DEDUCTION'; today: string; defaultOpen?: boolean }) {
  const t = useTranslations('admin.paySettings');
  const [advanced, setAdvanced] = useState(false);
  const [round, setRound] = useState(0); // 닫으면 안내를 처음부터 다시
  const close = () => {
    window.dispatchEvent(new CustomEvent(CLOSE_SHEET_EVENT, { detail: SHEET }));
    setRound((r) => r + 1);
    setAdvanced(false);
  };
  return (
    <>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SHEET_EVENT, { detail: SHEET }))} className="order-first inline-flex min-h-11 w-full items-center justify-center rounded-button bg-primary px-4 text-sm font-bold text-on-primary lg:order-last lg:h-9 lg:min-h-0 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:font-semibold">
        <ListPlus aria-hidden size={16} />
        {t('add')}
      </button>
      <AddSheet id={SHEET} title={t('item.addTitle')} modal defaultOpen={defaultOpen}>
        {advanced ? (
          <div className="flex flex-col gap-4">
            <ItemForm kind={kind} today={today} />
            <button type="button" onClick={() => setAdvanced(false)} className="self-start text-sm font-bold text-primary underline">{t('wiz.guided')}</button>
          </div>
        ) : (
          <Wizard key={round} kind={kind} today={today} onAdvanced={() => setAdvanced(true)} onClose={close} />
        )}
      </AddSheet>
    </>
  );
}
