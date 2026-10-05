'use client';
// 폰 등록이 안 될 때의 안내 (2026-10-02 실측: 실제 폰에서 "취소되었습니다"만 떠서 할 일을 알 수 없었다).
// - 카카오톡·네이버·인스타그램 등 "앱 안 브라우저"는 패스키를 만들지 못하는 경우가 많다 → 열자마자 알려 준다
// - 실패하면 폰 종류별로 확인할 것을 보여 준다 (아이폰: iCloud 키체인, 안드로이드: Chrome + Google 계정 + 화면 잠금)
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Env = { inApp: boolean; platform: 'ios' | 'android' | 'other' };

export function detectEnv(): Env {
  const ua = navigator.userAgent;
  const inApp = /KAKAOTALK|NAVER\(inapp|NAVER|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
  const platform = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  return { inApp, platform };
}

/** 등록 화면 위쪽: 앱 안 브라우저면 바로 경고 */
export function InAppWarning() {
  const t = useTranslations('passkeyHelp');
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => setEnv(detectEnv()), []);
  if (!env?.inApp) return null;
  return (
    <div role="alert" className="flex gap-2 rounded-card border border-warn bg-warn-tint p-3 text-sm text-warn">
      <TriangleAlert aria-hidden size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{t('inAppTitle')}</p>
        <p>{t(env.platform === 'ios' ? 'inAppIos' : 'inAppAndroid')}</p>
      </div>
    </div>
  );
}

/** 등록이 실패했을 때: 폰 종류별 확인 목록 */
export function RegisterTroubleshoot() {
  const t = useTranslations('passkeyHelp');
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => setEnv(detectEnv()), []);
  if (!env) return null;
  const keys = env.inApp
    ? ['inAppFirst']
    : env.platform === 'ios'
      ? ['ios1', 'ios2', 'ios3']
      : env.platform === 'android'
        ? ['android1', 'android2', 'android3']
        : ['other1'];
  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface p-3 text-sm">
      <p className="font-semibold">{t('checkTitle')}</p>
      <ol className="flex flex-col gap-2">
        {keys.map((k, i) => (
          <li key={k} className="flex items-start gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-chip bg-primary text-xs font-semibold text-on-primary">{i + 1}</span>
            <span className="pt-0.5">{t(k)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
