'use client';
// "홈 화면에 추가" 안내 (마스터 5장·12장 6번: 아이폰은 공유 → 홈 화면에 추가, 안드로이드는 메뉴 → 홈 화면에 추가/앱 설치).
// 이미 앱처럼 열려 있으면(standalone) 보이지 않는다. 홈의 작은 안내는 "닫기"를 누르면 이 폰에서 다시 안 보인다.
import { Share, SquarePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Platform = 'ios' | 'android' | 'other';
const KEY = 'install-guide-dismissed';

function detect(): { platform: Platform; installed: boolean } {
  const ua = navigator.userAgent;
  const platform: Platform = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return { platform, installed };
}

export function InstallGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('install');
  const [state, setState] = useState<{ platform: Platform; installed: boolean; dismissed: boolean } | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {}
    setState({ ...detect(), dismissed });
  }, []);

  if (!state || state.installed || (compact && state.dismissed)) return null;
  const steps = state.platform === 'ios' ? ['ios1', 'ios2', 'ios3'] : state.platform === 'android' ? ['android1', 'android2', 'android3'] : ['other1'];

  return (
    <section className="flex flex-col gap-2 rounded-card border border-primary-tint bg-bg p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-primary-deep">
          <SquarePlus aria-hidden size={20} strokeWidth={1.75} className="text-primary" />
          {t('title')}
        </h2>
        {compact && (
          <button
            type="button"
            aria-label={t('close')}
            className="flex size-11 items-center justify-center text-faint"
            onClick={() => {
              try {
                localStorage.setItem(KEY, '1');
              } catch {}
              setState({ ...state, dismissed: true });
            }}
          >
            <X aria-hidden size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <p className="text-sm text-muted">{t('why')}</p>
      <ol className="flex flex-col gap-2">
        {steps.map((k, i) => (
          <li key={k} className="flex items-start gap-3 text-sm">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-chip bg-primary text-xs font-semibold text-on-primary">{i + 1}</span>
            <span className="pt-0.5">
              {t(k)}
              {k === 'ios1' && <Share aria-hidden size={16} strokeWidth={1.75} className="ml-1 inline align-text-bottom text-primary" />}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
