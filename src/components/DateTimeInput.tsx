'use client';
// 날짜·시각 입력칸. 브라우저 기본 칸은 앱 언어가 아니라 폰(OS) 언어로 글자를 그린다 —
// 앱을 영어로 바꿔도 "연도-월-일", "오전/오후"가 보인다 (2026-10-02 의뢰인). 그래서 칸 안 글자는 앱이 직접 그린다:
// 비었으면 번역된 형식 안내(YYYY-MM-DD), 고르면 언어와 상관없이 2026-10-02 · 09:00(24시간).
// 고르는 창(달력·시계)은 그대로 폰 기본 창을 쓴다 — 누르면 바로 열린다.
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

type Kind = 'date' | 'time' | 'datetime-local';

export function DateTimeInput({
  type,
  name,
  value,
  defaultValue,
  onChange,
  required,
  max,
  className = '',
  'aria-label': ariaLabel,
}: {
  type: Kind;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  max?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const t = useTranslations('common.dateFormat');
  const ref = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState(defaultValue ?? '');
  const v = value ?? own;
  const shown = v ? (type === 'datetime-local' ? v.replace('T', ' ') : v) : null;

  return (
    <span className="relative block">
      <input
        ref={ref}
        type={type}
        name={name}
        value={v}
        required={required}
        max={max}
        aria-label={ariaLabel}
        onChange={(e) => {
          if (value === undefined) setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        onClick={() => {
          try {
            ref.current?.showPicker?.(); // PC에서도 칸 어디를 눌러도 고르는 창이 열리게
          } catch {
            // 지원하지 않는 브라우저는 기본 동작
          }
        }}
        className={`${className} dt-native text-transparent caret-transparent`}
      />
      <span aria-hidden className={`num pointer-events-none absolute inset-y-0 left-3 flex items-center text-base ${shown ? 'text-text' : 'text-faint'}`}>
        {shown ?? t(type === 'date' ? 'date' : type === 'time' ? 'time' : 'dateTime')}
      </span>
    </span>
  );
}
