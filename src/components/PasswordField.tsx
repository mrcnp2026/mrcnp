'use client';
// 비밀번호 입력 칸 — 눈 모양 버튼으로 잠깐 보이게 할 수 있다 (폰 자판에서 오타를 못 보고 여러 번 틀리는 것을 줄인다).
// 문구는 부르는 쪽이 번역 파일에서 읽어 넘긴다 (4-10).
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showLabel,
  hideLabel,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  showLabel: string;
  hideLabel: string;
  hint?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-sm text-muted">
      <label htmlFor={id}>{label}</label>
      <div className="relative flex">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={72}
          required
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-h-14 w-full rounded-button border border-border bg-bg py-2 pr-14 pl-4 text-lg text-text"
        />
        <button
          type="button"
          aria-label={shown ? hideLabel : showLabel}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
          className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-muted"
        >
          {shown ? <EyeOff aria-hidden size={20} strokeWidth={1.75} /> : <Eye aria-hidden size={20} strokeWidth={1.75} />}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}
