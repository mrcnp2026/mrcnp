'use client';
// PC(마우스 화면)의 날짜 · 시각 고르기 창 — 2026-10-23 의뢰인: 브라우저 기본 창(오전/오후 · 연도-월-일 · 디자인 제각각)이 대충 만든 것 같다.
// 화면 전체에 하나만 둔다: 날짜 · 시각 · 달 칸(<input type="date|time|datetime-local|month">)을 누르면 우리 모양의 달력 · 시각 목록이 뜬다.
// 칸은 그대로 진짜 <input>이라 폼 전송 · 필수 확인 · onChange가 예전과 같다(값을 넣고 input 이벤트를 보낸다). 폰은 손가락용 기본 창이 편해서 그대로 둔다.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const KINDS = ['date', 'time', 'datetime-local', 'month'];
const PC = '(min-width: 1024px) and (pointer: fine)';
const pad = (n: number) => String(n).padStart(2, '0');

function setValue(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function PickerHost() {
  const [el, setEl] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const input = (e.target as HTMLElement | null)?.closest?.('input') as HTMLInputElement | null;
      if (!input || !KINDS.includes(input.type) || input.disabled || input.readOnly || !window.matchMedia(PC).matches) return;
      e.preventDefault();
      setEl((cur) => (cur === input ? null : input));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  if (!el || !el.isConnected) return null;
  return <Picker key={el.name + el.type + (el.id || '')} el={el} onClose={() => setEl(null)} />;
}

function Picker({ el, onClose }: { el: HTMLInputElement; onClose: () => void }) {
  const t = useTranslations('common.dateFormat');
  const locale = useLocale();
  const kind = el.type as 'date' | 'time' | 'datetime-local' | 'month';
  const boxRef = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(el.value);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const hasDate = kind !== 'time';
  const hasTime = kind === 'time' || kind === 'datetime-local';
  const datePart = kind === 'month' ? `${val.slice(0, 7)}-01` : val.slice(0, 10);
  const timePart = kind === 'time' ? val : kind === 'datetime-local' ? val.slice(11, 16) : '';
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const seed = /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : todayStr;
  const [view, setView] = useState({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) });
  const max = el.max || '';
  const min = el.min || '';
  const cut = (d: string) => (kind === 'month' ? d.slice(0, 7) : d);
  const outOfRange = (d: string) => (!!max && cut(d) > max.slice(0, cut(d).length)) || (!!min && cut(d) < min.slice(0, cut(d).length));

  const commit = (next: string, close: boolean) => {
    setVal(next);
    setValue(el, next);
    if (close) onClose();
  };
  const join = (d: string, tm: string) => (kind === 'time' ? tm : kind === 'datetime-local' ? `${d}T${tm || '00:00'}` : kind === 'month' ? d.slice(0, 7) : d);

  useEffect(() => {
    const r = el.getBoundingClientRect();
    const h = hasDate ? 350 : 280;
    const w = (hasDate ? 256 : 0) + (hasTime ? 136 : 0) + 16;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPos(window.innerHeight - r.bottom < h && r.top > window.innerHeight - r.bottom ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
  }, [el, hasDate, hasTime]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const tg = e.target as Node;
      if (!boxRef.current?.contains(tg) && tg !== el) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onMove = (e: Event) => !boxRef.current?.contains(e.target as Node) && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [el, onClose]);
  useEffect(() => {
    boxRef.current?.querySelectorAll<HTMLElement>('[data-on="true"]').forEach((n) => n.scrollIntoView({ block: 'center' }));
  }, [pos]);

  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 1 + i))); // 2023-01-01 = 일요일
  }, [locale]);
  const title = new Intl.DateTimeFormat(locale, { year: 'numeric', month: kind === 'month' ? undefined : 'long' }).format(new Date(view.y, view.m - 1, 1));
  const first = new Date(view.y, view.m - 1, 1).getDay();
  const days = new Date(view.y, view.m, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => i - first + 1);
  const shiftMonth = (d: number) => setView((v) => (kind === 'month' ? { y: v.y + d, m: v.m } : { y: v.m + d < 1 ? v.y - 1 : v.m + d > 12 ? v.y + 1 : v.y, m: v.m + d < 1 ? 12 : v.m + d > 12 ? 1 : v.m + d }));
  const hh = timePart.slice(0, 2);
  const mm = timePart.slice(3, 5);
  const nav = 'flex size-8 items-center justify-center rounded-button text-muted hover:bg-surface hover:text-text';
  const cell = 'flex h-8 items-center justify-center rounded-button text-sm';

  return createPortal(
    <div ref={boxRef} role="dialog" style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, visibility: pos ? 'visible' : 'hidden' }} className="z-[80] flex flex-col gap-2 rounded-card border border-border bg-bg p-2 shadow-pop">
      <div className="flex gap-2">
        {hasDate && (
          <div className="flex w-64 flex-col gap-1">
            <div className="flex items-center justify-between">
              <button type="button" aria-label="prev" onClick={() => shiftMonth(-1)} className={nav}>
                <ChevronLeft aria-hidden size={16} />
              </button>
              <span className="num text-sm font-bold">{title}</span>
              <button type="button" aria-label="next" onClick={() => shiftMonth(1)} className={nav}>
                <ChevronRight aria-hidden size={16} />
              </button>
            </div>
            {kind === 'month' ? (
              <div className="grid grid-cols-3 gap-1 pt-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const ym = `${view.y}-${pad(m)}`;
                  const on = val.slice(0, 7) === ym;
                  const off = outOfRange(`${ym}-01`);
                  return (
                    <button key={m} type="button" disabled={off} data-on={on} onClick={() => commit(ym, true)} className={`${cell} h-10 ${on ? 'bg-primary font-bold text-on-primary' : 'hover:bg-primary-tint'} disabled:text-faint disabled:hover:bg-transparent`}>
                      {new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(view.y, m - 1, 1))}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-0.5">
                {weekdays.map((w, i) => (
                  <span key={w} className={`flex h-7 items-center justify-center text-xs font-semibold ${i === 0 ? 'text-danger' : 'text-muted'}`}>
                    {w}
                  </span>
                ))}
                {cells.map((d, i) => {
                  if (d < 1 || d > days) return <span key={i} />;
                  const ds = `${view.y}-${pad(view.m)}-${pad(d)}`;
                  const on = datePart === ds;
                  const off = outOfRange(ds);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={off}
                      data-on={on}
                      onClick={() => commit(join(ds, timePart), kind === 'date')}
                      className={`${cell} num ${on ? 'bg-primary font-bold text-on-primary' : ds === todayStr ? 'border border-primary font-bold text-primary-ink hover:bg-primary-tint' : i % 7 === 0 ? 'text-danger hover:bg-primary-tint' : 'hover:bg-primary-tint'} disabled:text-faint disabled:hover:bg-transparent`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {hasTime && (
          <div className="flex gap-1 border-border pl-2 first:pl-0 [&:not(:first-child)]:border-l">
            {[
              { label: t('hour'), n: 24, cur: hh, set: (v: string) => commit(join(datePart, `${v}:${mm || '00'}`), false) },
              { label: t('minute'), n: 60, cur: mm, set: (v: string) => commit(join(datePart, `${hh || '00'}:${v}`), false) },
            ].map((col) => (
              <div key={col.label} className="flex w-16 flex-col">
                <span className="pb-1 text-center text-xs font-semibold text-muted">{col.label}</span>
                <div className="flex h-56 flex-col gap-0.5 overflow-y-auto pr-0.5">
                  {Array.from({ length: col.n }, (_, i) => pad(i)).map((v) => (
                    <button key={v} type="button" data-on={col.cur === v} onClick={() => col.set(v)} className={`${cell} num shrink-0 ${col.cur === v ? 'bg-primary font-bold text-on-primary' : 'hover:bg-primary-tint'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-border pt-2">
        {hasDate && kind !== 'month' && (
          <button type="button" disabled={outOfRange(todayStr)} onClick={() => commit(join(todayStr, timePart), kind === 'date')} className="min-h-8 rounded-button px-2 text-sm font-semibold text-primary-ink hover:bg-primary-tint disabled:text-faint disabled:hover:bg-transparent">
            {t('today')}
          </button>
        )}
        {!el.required && (
          <button type="button" onClick={() => commit('', true)} className="min-h-8 rounded-button px-2 text-sm text-muted hover:bg-surface">
            {t('clear')}
          </button>
        )}
        <button type="button" onClick={onClose} className="ml-auto min-h-8 rounded-button bg-primary px-3 text-sm font-semibold text-on-primary">
          {t('done')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
