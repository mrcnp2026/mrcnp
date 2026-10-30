'use client';
// 파일 받기 단추 (2026-10-30 의뢰인: 폰에서 명세서 PDF가 미리보기만 되고 받아지지 않는다).
// 홈 화면에 추가한 앱(standalone)에서는 링크로 연 PDF가 저장 단추 없는 미리보기로만 열린다.
// 그래서 파일을 먼저 받아 와서, 폰이면 공유 시트(「파일에 저장」)로, PC면 바로 내려받기로 넘긴다.
// 공유 시트가 막히면(누른 지 오래 지남) 받아 둔 파일로 한 번 더 누르게 하고, 그래도 안 되면 링크로 연다.
import { useRef, useState, type ReactNode } from 'react';

function fileNameOf(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {}
  }
  return /filename="([^"]+)"/i.exec(cd)?.[1] ?? fallback;
}

const touch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function SaveFileLink({ href, className, children, again }: { href: string; className?: string; children: ReactNode; again: string }) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const file = useRef<File | null>(null);

  function download(f: File) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function hand(f: File): Promise<boolean> {
    if (touch() && navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f] });
        return true;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return true; // 본인이 닫음
        return false; // 누른 지 오래 지나 막힘 — 한 번 더 누르게 한다
      }
    }
    download(f);
    return true;
  }

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    if (busy) return;
    if (file.current) {
      if (await hand(file.current)) setReady(false);
      else window.location.href = href;
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        window.location.href = href; // 오류 화면은 원래대로 보여 준다
        return;
      }
      const blob = await res.blob();
      const f = new File([blob], fileNameOf(res, 'file.pdf'), { type: blob.type || 'application/pdf' });
      file.current = f;
      if (!(await hand(f))) setReady(true);
    } catch {
      window.location.href = href;
    } finally {
      setBusy(false);
    }
  }

  return (
    <a href={href} onClick={onClick} aria-busy={busy} className={`${className ?? ''} ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      {ready ? again : children}
    </a>
  );
}
