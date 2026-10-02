'use client';
// "홈 화면에 추가" 단계 안내 — 화면 아래에서 올라오는 판 (설치 창을 띄울 수 없는 아이폰 등).
// 아이폰은 iOS 버전마다 공유 버튼 위치가 달라 글로는 찾기 어렵다 (2026-10-02 의뢰인). 그래서 Safari 아래 도구 막대를
// 그림으로 그리고 누를 버튼에 테두리를 둘러 보여 준다:
//   ① 예전 iOS: 맨 아래 가운데 공유(□↑)  ② 최신 iOS: 오른쪽 아래 ⋯ → 공유
// 그림은 실제 화면이 아니라 아이콘으로 그린 설명용이다 (이미지 파일·스크린샷 없음, R-10-8).
import { ArrowDown, BookOpen, ChevronLeft, ChevronRight, Copy, Ellipsis, Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from './ui';

function Toolbar({ icons, mark }: { icons: LucideIcon[]; mark: number }) {
  return (
    <div className="flex items-center justify-around rounded-card border border-border bg-surface px-2 py-2">
      {icons.map((Icon, i) => (
        <span
          key={i}
          className={`flex size-10 items-center justify-center rounded-button ${i === mark ? 'border-2 border-primary bg-primary-tint text-primary' : 'text-faint'}`}
        >
          <Icon aria-hidden size={20} strokeWidth={1.75} />
        </span>
      ))}
    </div>
  );
}

export function InstallSheet({ platform, onDone, onClose }: { platform: 'ios' | 'android' | 'other'; onDone: () => void; onClose: () => void }) {
  const t = useTranslations('install');
  const steps = platform === 'ios' ? ['ios1', 'ios2', 'ios3'] : platform === 'android' ? ['android1', 'android2', 'android3'] : ['other1'];
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-text/40" role="dialog" aria-modal="true" aria-label={t('title')}>
      <div className="mx-auto max-h-dvh w-full max-w-md overflow-y-auto rounded-t-card bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card">
        <h2 className="text-xl font-semibold text-primary-deep">{t('title')}</h2>

        {platform === 'ios' && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{t('iosFindA')}</p>
              <Toolbar icons={[ChevronLeft, ChevronRight, Share, BookOpen, Copy]} mark={2} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{t('iosFindB')}</p>
              <Toolbar icons={[ChevronLeft, Copy, Ellipsis]} mark={2} />
            </div>
            <div className="flex items-center gap-2 rounded-button bg-surface p-2 text-sm">
              <SquarePlus aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-primary" />
              {t('iosThen')}
            </div>
          </div>
        )}

        {platform !== 'ios' && (
          <ol className="mt-3 flex flex-col gap-3">
            {steps.map((k, i) => (
              <li key={k} className="flex items-start gap-3 text-base">
                <span className="num flex size-7 shrink-0 items-center justify-center rounded-chip bg-primary text-sm font-semibold text-on-primary">{i + 1}</span>
                <span className="pt-0.5">{t(k)}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t('close')}
          </Button>
          <Button className="flex-1" onClick={onDone}>
            {t('addedContinue')}
          </Button>
        </div>
        {platform === 'ios' && (
          <p className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-primary">
            <ArrowDown aria-hidden size={18} strokeWidth={1.75} />
            {t('shareBelow')}
            <ArrowDown aria-hidden size={18} strokeWidth={1.75} />
          </p>
        )}
      </div>
    </div>
  );
}
