'use client';
// 저장 규칙 (2026-10-14 문서 07 6장 「저장 규칙」, 결정 사항 개발-24):
//   ① 처음 값에서 바뀐 것이 없으면 저장 단추는 꺼져 있다 — 양식의 지금 값(FormData)을 처음 값과 비교한다
//   ② 바꾼 채로 화면을 떠나려 하면(다른 메뉴 누르기 · 창 닫기 · 새로 고침) 한 번 묻는다
// 쓰는 쪽: const { dirty, ref, settle } = useSaveRule(); <form ref={ref} …> · <Button disabled={busy || !dirty}> · 저장에 성공하면 settle()
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

const snap = (f: HTMLFormElement) => JSON.stringify([...new FormData(f)].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]));

export function useSaveRule() {
  const t = useTranslations('common');
  const ref = useRef<HTMLFormElement>(null);
  const first = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    first.current = snap(f);
    // 손으로 바꾸는 값(입력 · 고르기)은 input/change, 단추로 바꾸는 값(요일 고르기 등)은 click 뒤에 다시 본다
    const check = () => requestAnimationFrame(() => ref.current && setDirty(snap(ref.current) !== first.current));
    f.addEventListener('input', check);
    f.addEventListener('change', check);
    f.addEventListener('click', check);
    return () => {
      f.removeEventListener('input', check);
      f.removeEventListener('change', check);
      f.removeEventListener('click', check);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const msg = t('unsaved');
    // 닫아 둔 창(추가 시트 등) 안의 양식은 묻지 않는다 — 화면에 보이는 양식만
    const shown = () => !!ref.current && ref.current.isConnected && ref.current.getClientRects().length > 0;
    const unload = (e: BeforeUnloadEvent) => {
      if (!shown()) return;
      e.preventDefault();
      e.returnValue = msg;
    };
    // 화면 안의 다른 링크(메뉴 등)를 누를 때 — 양식 안의 단추는 상관없다
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || !shown() || ref.current?.contains(a) || e.defaultPrevented) return;
      if (!window.confirm(msg)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, t]);

  /** 저장에 성공했을 때 — 지금 값을 새 처음 값으로 */
  const settle = useCallback(() => {
    if (ref.current) first.current = snap(ref.current);
    setDirty(false);
  }, []);

  return { ref, dirty, settle };
}
