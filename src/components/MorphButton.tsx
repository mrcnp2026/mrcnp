'use client';
// 누르면 동그라미로 줄어들고, 처리하는 동안 둘레에 고리가 돈다 → 끝나면 고리가 한 바퀴 닫히고 다시 알약 모양으로 펴진다.
// (2026-10-27 의뢰인: Code and Chill 「Delete Button」 영상의 단추 움직임을 넣되, 휴지통이 글자를 먹는 연출은 과하니까 빼고)
// 언제 줄어드나: 누른 직후(0.6초 안)에 disabled가 켜지면 — 부르는 쪽이 원래 쓰던 disabled={busy} 그대로 동작한다. 따로 넘길 값이 없다.
// 성공 · 실패는 단추가 모르므로 ✓를 그리지 않는다. 결과는 부르는 쪽이 지금처럼 글자로 보여 준다.
// 자리(폭 · 높이)는 그대로 두고 보이는 모양만 clip-path로 줄인다 — 표 · 줄 안에서 옆 칸이 밀리지 않게.
// 움직임 줄이기 설정이면 줄어들지 않고 글자도 그대로다 (globals.css .morph).
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';

type Phase = 'idle' | 'busy' | 'close';

export function MorphButton({ disabled, onClick, children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const pressed = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    if (disabled && phase === 'idle' && Date.now() - pressed.current < 600) {
      const el = ref.current;
      if (el) setInset(Math.max(0, (el.offsetWidth - el.offsetHeight) / 2));
      setPhase('busy');
    } else if (!disabled && phase === 'busy') {
      setPhase('close');
    }
  }, [disabled, phase]);

  useEffect(() => {
    if (phase !== 'close') return;
    const t = setTimeout(() => setPhase('idle'), 380); // 고리가 닫히는 시간 (globals.css morph-close)
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <button
      ref={ref}
      disabled={disabled}
      data-morph={phase}
      onClick={(e) => {
        pressed.current = Date.now();
        onClick?.(e);
      }}
      style={{ ...style, ['--morph-x' as string]: `${inset}px` }}
      {...rest}
      className={`morph ${rest.className ?? ''}`}
    >
      <span className="morph-label">{children}</span>
      <span className="morph-ring" aria-hidden="true" />
    </button>
  );
}
