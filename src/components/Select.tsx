'use client';
// 고르기 칸 — 쓰는 법은 <select> 그대로(<option> · name · value · defaultValue · onChange · required).
// 2026-10-23 의뢰인: PC에서 고르기 목록이 브라우저 기본 모양이라 대충 만든 것 같다 → PC(1024px~)는 우리 모양의 목록, 폰은 기본 고르기(손가락으로 돌리는 목록이 더 편하다).
// 안쪽에는 진짜 <select>가 그대로 있어서 폼 전송 · 필수 확인 · onChange(e.target.value)가 예전과 같다.
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Opt = { value: string; label: string; disabled?: boolean };
type Entry = { group: string | null; opt?: Opt };

function textOf(n: ReactNode): string {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return '';
}

// <option> · <optgroup> 을 (조각 · 배열 · map 결과 속에 있어도) 찾아서 한 줄로 편다
function collect(children: ReactNode, group: string | null, out: Entry[]) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string | number; disabled?: boolean; label?: string; children?: ReactNode }>;
    if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ group, opt: { value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: el.props.disabled } });
    } else if (el.type === 'optgroup') {
      out.push({ group: el.props.label ?? '' });
      collect(el.props.children, el.props.label ?? '', out);
    } else if (el.type === Fragment) {
      collect(el.props.children, group, out);
    }
  });
}

type Props = Omit<ComponentPropsWithoutRef<'select'>, 'value' | 'defaultValue'> & { value?: string | number; defaultValue?: string | number };

export function Select({ children, className = '', value, defaultValue, onChange, disabled, multiple, ...rest }: Props) {
  const entries = useMemo(() => {
    const out: Entry[] = [];
    collect(children, null, out);
    return out;
  }, [children]);
  const options = useMemo(() => entries.flatMap((e) => (e.opt ? [e.opt] : [])), [entries]);
  const listId = useId();
  const nativeRef = useRef<HTMLSelectElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(() => String(value ?? defaultValue ?? options[0]?.value ?? ''));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);

  useEffect(() => {
    if (value !== undefined) setCur(String(value));
  }, [value]);
  // 목록이 바뀌어 지금 값이 없어지면 진짜 칸이 고른 첫 값을 따라간다 (<select>와 같은 동작)
  useEffect(() => {
    if (nativeRef.current && nativeRef.current.value !== cur) setCur(nativeRef.current.value);
  }, [options, cur]);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    const maxH = Math.max(120, Math.min(320, up ? above : below));
    setPos(up ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxH } : { left: r.left, width: r.width, top: r.bottom + 4, maxH });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!listRef.current?.contains(t) && !btnRef.current?.contains(t)) close();
    };
    const onMove = (e: Event) => {
      if (e.type === 'scroll' && listRef.current?.contains(e.target as Node)) return; // 목록 안쪽 스크롤은 닫지 않는다
      close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, close]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  if (multiple) {
    return (
      <select {...rest} multiple disabled={disabled} value={value === undefined ? undefined : String(value)} defaultValue={defaultValue === undefined ? undefined : String(defaultValue)} onChange={onChange} className={className}>
        {children}
      </select>
    );
  }

  const shown = options.find((o) => o.value === cur);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  // 우리 목록에서 고르면 진짜 칸의 값을 바꾸고 change 를 보낸다 → 부르는 쪽의 onChange · 폼의 onChange 가 그대로 돈다
  const pick = (v: string) => {
    setOpen(false);
    btnRef.current?.focus();
    const el = nativeRef.current;
    if (!el || v === el.value) return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const step = (dir: 1 | -1) => {
    const at = enabled.indexOf(active);
    setActive(enabled[Math.min(enabled.length - 1, Math.max(0, at + dir))] ?? active);
  };
  const toggle = () => {
    if (disabled) return;
    if (!open) setActive(Math.max(0, options.findIndex((o) => o.value === cur)));
    setOpen((v) => !v);
  };

  const body = (() => {
    let idx = -1;
    return entries.map((e, k) => {
      if (!e.opt) return <div key={`g${k}`} className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">{e.group}</div>;
      idx += 1;
      const i = idx;
      const o = e.opt;
      const on = o.value === cur;
      return (
        <div
          key={`o${k}`}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={on}
          aria-disabled={o.disabled || undefined}
          data-active={i === active}
          onMouseEnter={() => !o.disabled && setActive(i)}
          onClick={() => !o.disabled && pick(o.value)}
          className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-button px-3 py-1.5 text-sm ${e.group ? 'pl-5' : ''} ${o.disabled ? 'cursor-not-allowed text-faint' : i === active ? 'bg-primary-tint text-primary-ink' : 'text-text'} ${on ? 'font-semibold' : ''}`}
        >
          <span className="min-w-0 flex-1 break-words">{o.label || ' '}</span>
          {on && <Check aria-hidden size={16} className="shrink-0 text-primary" />}
        </div>
      );
    });
  })();

  return (
    <>
      <select
        {...rest}
        ref={nativeRef}
        disabled={disabled}
        value={cur}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          setCur(e.target.value);
          onChange?.(e);
        }}
        className={`sel-native ${className}`}
      >
        {children}
      </select>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) toggle();
            else step(e.key === 'ArrowDown' ? 1 : -1);
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const o = options[active];
            if (o && !o.disabled) pick(o.value);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === 'Tab') setOpen(false);
        }}
        className={`sel-custom items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${shown?.label ? '' : 'text-faint'}`}>{shown?.label || ' '}</span>
        <ChevronDown aria-hidden size={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ position: 'fixed', left: pos.left, minWidth: pos.width, maxWidth: 'min(28rem, calc(100vw - 16px))', top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            className="z-[70] overflow-y-auto rounded-card border border-border bg-bg p-1 shadow-pop"
          >
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}
