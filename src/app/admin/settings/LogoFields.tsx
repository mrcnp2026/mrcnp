'use client';
// 회사 로고 · 앱 아이콘 (2026-11-03 의뢰인: 고르면 바로 올라가 어떻게 보일지 몰랐다 — 다른 플랫폼처럼 맞추기 · 미리보기 · 안내).
// 파일을 고르면 맞추기 창(ImageCropper)이 열리고, 실제 자리(PC · 폰 위 띠 · 로그인 / 홈 화면 · 탭)에 놓인 모습을 보며 저장한다.
import { Plus, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorNote } from '@/components/ErrorNote';
import { ImageCropper, type CropNote } from '@/components/ImageCropper';
import { Button } from '@/components/ui';
import { ICON_BG } from '@/config/theme';

type Kind = 'logo' | 'icon';
const API: Record<Kind, string> = { logo: '/api/admin/company/logo', icon: '/api/admin/company/icon' };

/** 로고가 이 회사 화면에 잘 맞는지 — 비율 · 크기 · 바탕 */
function logoWarnings(n: CropNote): string[] {
  const out: string[] = [];
  if (n.ratio < 1.5) out.push('warnSquare');
  if (n.ratio > 6) out.push('warnLong');
  if (n.srcW < 400) out.push('warnSmall');
  if (n.opaqueBg) out.push('warnBg');
  return out;
}

export function LogoFields({ hasLogo, logoAt, hasIcon, iconAt }: { hasLogo: boolean; logoAt: string | null; hasIcon: boolean; iconAt: string | null }) {
  const t = useTranslations('admin.settings.company');
  const router = useRouter();
  const [file, setFile] = useState<{ kind: Kind; f: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ code: string } | null>(null);
  const [ver, setVer] = useState({ logo: logoAt ?? '0', icon: iconAt ?? '0' });
  const [has, setHas] = useState({ logo: hasLogo, icon: hasIcon });
  const pick = { logo: useRef<HTMLInputElement>(null), icon: useRef<HTMLInputElement>(null) };

  async function send(kind: Kind, blob: Blob | null) {
    setBusy(true);
    setErr(null);
    let res: Response;
    if (blob) {
      const fd = new FormData();
      fd.append('file', new File([blob], `${kind}.png`, { type: 'image/png' }));
      fd.append('edited', '1');
      res = await fetch(API[kind], { method: 'POST', body: fd });
    } else res = await fetch(API[kind], { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setErr({ code: ((await res.json().catch(() => ({}))) as { code?: string }).code ?? 'unknown' });
    setFile(null);
    setHas({ ...has, [kind]: !!blob });
    setVer({ ...ver, [kind]: String(Date.now()) });
    router.refresh();
  }

  const box = 'flex h-14 min-w-28 items-center justify-center rounded-button border border-border bg-surface px-3';
  const row = (kind: Kind) => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={box}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={kind === 'logo' ? `/api/brand/logo?v=${encodeURIComponent(ver.logo)}` : `/api/brand/icon?s=s192&v=${encodeURIComponent(ver.icon)}`} alt={t(kind)} className={kind === 'logo' ? 'h-9 w-auto max-w-48 object-contain' : 'size-10 rounded-xl'} />
        </span>
        <input ref={pick[kind]} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile({ kind, f }); e.target.value = ''; }} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => pick[kind].current?.click()}>
          {t(kind === 'logo' ? 'logoPick' : 'iconPick')}
        </Button>
        {has[kind] && (
          <button type="button" disabled={busy} onClick={() => send(kind, null)} className="min-h-9 text-sm text-muted underline">
            {t(kind === 'logo' ? 'logoReset' : 'iconReset')}
          </button>
        )}
      </div>
      <p className="text-xs text-faint">{t(kind === 'logo' ? 'logoGuide' : 'iconGuide')}</p>
    </div>
  );

  // 실제 자리에 놓아 본 모습
  const logoPreview = (url: string | null, note: CropNote | null) => (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t('previewTitle')}</p>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <figure className="flex flex-col gap-1">
          <div className="flex h-14 items-center gap-3 rounded-button border border-border bg-bg px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && <img src={url} alt="" style={{ height: 28, width: 'auto', maxWidth: 168 }} className="object-contain" />}
            <span className="mx-auto h-7 w-1/3 rounded-full bg-surface" />
            <span className="size-7 rounded-full bg-surface" />
          </div>
          <figcaption className="text-xs text-faint">{t('pvPc')}</figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <div className="flex h-12 items-center gap-2 rounded-button border border-border bg-bg px-3">
            <span className="h-3 w-4 rounded-sm bg-surface" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && <img src={url} alt="" style={{ height: 24, width: 'auto', maxWidth: 120 }} className="object-contain" />}
          </div>
          <figcaption className="text-xs text-faint">{t('pvPhone')}</figcaption>
        </figure>
      </div>
      <figure className="flex flex-col gap-1">
        <div className="flex flex-col items-center gap-3 rounded-button border border-border bg-surface py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" style={{ height: 56, width: 'auto', maxWidth: 336 }} className="object-contain" />}
          <span className="h-9 w-56 rounded-button bg-bg" />
          <span className="h-9 w-56 rounded-button bg-primary/70" />
        </div>
        <figcaption className="text-xs text-faint">{t('pvLogin')}</figcaption>
      </figure>
      {note && logoWarnings(note).map((w) => (
        <p key={w} className="flex items-start gap-1.5 text-sm text-warn"><TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />{t(w)}</p>
      ))}
    </div>
  );
  const iconPreview = (url: string | null) => (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t('previewTitle')}</p>
      <div className="flex flex-wrap items-end gap-6">
        <figure className="flex flex-col items-center gap-1">
          <div className="grid grid-cols-3 gap-3 rounded-card bg-text/80 p-4">
            {[0, 1, 2].map((i) =>
              i === 1 ? (
                // eslint-disable-next-line @next/next/no-img-element
                url ? <img key={i} src={url} alt="" className="size-14 rounded-2xl" /> : <span key={i} className="size-14" />
              ) : (
                <span key={i} className="size-14 rounded-2xl bg-bg/30" />
              ),
            )}
          </div>
          <figcaption className="text-xs text-faint">{t('pvHome')}</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-1">
          <div className="flex h-9 w-56 items-center gap-2 rounded-t-button border border-b-0 border-border bg-bg px-3 text-xs text-text">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && <img src={url} alt="" className="size-4" />}
            <span className="truncate">{t('pvTabTitle')}</span>
            <X aria-hidden size={12} className="ml-auto text-faint" />
            <Plus aria-hidden size={12} className="text-faint" />
          </div>
          <figcaption className="text-xs text-faint">{t('pvTab')}</figcaption>
        </figure>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-1 text-sm lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-center lg:gap-4">
        <span className="font-semibold">{t('logo')}</span>
        {row('logo')}
      </div>
      <div className="flex flex-col gap-1 text-sm lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-center lg:gap-4">
        <span className="font-semibold">{t('icon')}</span>
        {row('icon')}
      </div>
      {err && <ErrorNote code={err.code} namespace="admin.settings.company" />}
      {/* 통합설정 판(움직이는 판) 안에 그리면 판에 갇혀 흐리게 보여서 문서 맨 위로 꺼내 그린다 */}
      {file && createPortal(
        <div role="dialog" aria-modal="true" aria-label={t(file.kind === 'logo' ? 'logoEdit' : 'iconEdit')} className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 lg:items-center">
          <div className="flex max-h-dvh w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bg p-4 shadow-pop lg:rounded-3xl lg:p-6">
            <h2 className="text-lg font-bold">{t(file.kind === 'logo' ? 'logoEdit' : 'iconEdit')}</h2>
            <ImageCropper
              file={file.f}
              aspects={file.kind === 'logo' ? [{ key: 'auto', ratio: null }, { key: 'r4', ratio: 4 }, { key: 'r3', ratio: 3 }, { key: 'r2', ratio: 2 }] : [{ key: 'square', ratio: 1 }]}
              outHeight={file.kind === 'logo' ? 240 : 512}
              background={file.kind === 'logo' ? null : ICON_BG}
              preview={file.kind === 'logo' ? logoPreview : (u) => iconPreview(u)}
              onCancel={() => setFile(null)}
              onDone={(r) => send(file.kind, r.blob)}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
