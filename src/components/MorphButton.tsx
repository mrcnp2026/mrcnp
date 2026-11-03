'use client';
// 누르면 동그라미로 줄어들고, 처리하는 동안 둘레에 고리가 돈다 → 끝나면 고리가 한 바퀴 닫히고 다시 알약 모양으로 펴진다.
// (2026-10-27 의뢰인: Code and Chill 「Delete Button」 영상의 단추 움직임을 넣되, 휴지통이 글자를 먹는 연출은 과하니까 빼고)
// 언제 줄어드나: 누른 직후(0.6초 안)에 서버 요청이 나가면. 언제 펴지나: 그 요청들이 모두 끝나면(2026-11-03 의뢰인: 「저장했습니다」가 나왔는데 계속 돌았다 —
//   저장 뒤에도 바뀐 것이 없어 disabled가 켜진 채로 남는 단추가 많았다). 그래서 disabled가 아니라 진행 중인 요청 수로 판단한다. 따로 넘길 값이 없다.
// 성공 · 실패는 단추가 모르므로 ✓를 그리지 않는다. 결과는 부르는 쪽이 지금처럼 글자로 보여 준다.
// 자리(폭 · 높이)는 그대로 두고 보이는 모양만 clip-path로 줄인다 — 표 · 줄 안에서 옆 칸이 밀리지 않게.
// 움직임 줄이기 설정이면 줄어들지 않고 글자도 그대로다 (globals.css .morph).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes } from 'react';

// 이 화면에서 진행 중인 요청 수 — fetch를 한 번만 감싸 센다(모든 단추가 같이 본다)
let inflight = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function track() {
  const w = window as Window & { __morphFetch?: boolean };
  if (w.__morphFetch) return;
  w.__morphFetch = true;
  const orig = w.fetch.bind(w);
  w.fetch = async (...args: Parameters<typeof fetch>) => {
    inflight++;
    emit();
    try {
      return await orig(...args);
    } finally {
      inflight--;
      emit();
    }
  };
}
const subscribe = (f: () => void) => {
  track();
  subs.add(f);
  return () => subs.delete(f);
};
const busyNow = () => inflight > 0;

type Phase = 'idle' | 'busy' | 'close';

export function MorphButton({ disabled, onClick, children, style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const pressed = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [inset, setInset] = useState(0);

  const net = useSyncExternalStore(subscribe, busyNow, () => false);

  useLayoutEffect(() => {
    if (net && phase === 'idle' && Date.now() - pressed.current < 600) {
      const el = ref.current;
      if (el) setInset(Math.max(0, (el.offsetWidth - el.offsetHeight) / 2));
      setPhase('busy');
    } else if (!net && phase === 'busy') {
      setPhase('close'); // 요청이 끝났다 — 단추가 아직 막혀 있어도(바뀐 것 없음) 펴진다
    }
  }, [net, phase]);

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
