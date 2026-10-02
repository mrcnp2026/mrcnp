'use client';
// 등록 완료 화면의 버튼 줄: 왼쪽 "홈 화면에 추가", 오른쪽 "계속" (2026-10-02 의뢰인 요청).
// "홈 화면에 추가" = ① 설치(안드로이드는 설치 창, 아이폰은 단계 안내) → ② 이어서 "계속"과 같은 곳으로 이동.
// 이미 앱으로 열려 있으면 추가 버튼은 숨기고 "계속"만 보인다.
import { ArrowRight, SquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { InstallSheet } from './InstallSheet';
import { Button } from './ui';
import { useInstall } from './useInstall';

export function AddToHomeAndContinue({ next }: { next: string }) {
  const t = useTranslations();
  const { state, promptInstall } = useInstall();
  const [sheet, setSheet] = useState(false);
  const go = () => window.location.assign(next);

  async function add() {
    const r = await promptInstall();
    if (r === 'accepted') return go(); // 아이콘이 생겼으면 바로 다음 화면으로
    if (r === 'unavailable') setSheet(true); // 아이폰 등: 단계 안내 → "추가했어요 · 계속"
    // dismissed: 사용자가 설치 창을 닫음 — 그대로 둔다
  }

  return (
    <>
      <div className="flex gap-2">
        {state && !state.installed && (
          <Button variant="outline" className="flex-1" onClick={add}>
            <SquarePlus aria-hidden size={20} strokeWidth={1.75} />
            {t('install.addButton')}
          </Button>
        )}
        <Button className="flex-1" onClick={go}>
          {t('register.continue')}
          <ArrowRight aria-hidden size={20} strokeWidth={1.75} />
        </Button>
      </div>
      {sheet && state && <InstallSheet platform={state.platform} onDone={go} onClose={() => setSheet(false)} />}
    </>
  );
}

/** 직원 홈의 작은 버튼: 설치만 (이동 없음) */
export function AddToHomeButton() {
  const t = useTranslations('install');
  const { state, promptInstall } = useInstall();
  const [sheet, setSheet] = useState(false);
  if (!state || state.installed) return null;
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          if ((await promptInstall()) === 'unavailable') setSheet(true);
        }}
      >
        <SquarePlus aria-hidden size={20} strokeWidth={1.75} />
        {t('addButton')}
      </Button>
      {sheet && <InstallSheet platform={state.platform} onDone={() => setSheet(false)} onClose={() => setSheet(false)} />}
    </>
  );
}

/** 상단 바용 작은 아이콘 버튼 — 아직 홈 화면에 추가하지 않았을 때만 보인다 */
export function AddToHomeIcon() {
  const t = useTranslations('install');
  const { state, promptInstall } = useInstall();
  const [sheet, setSheet] = useState(false);
  if (!state || state.installed) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t('addButton')}
        title={t('addButton')}
        className="flex size-11 items-center justify-center rounded-button text-primary"
        onClick={async () => {
          if ((await promptInstall()) === 'unavailable') setSheet(true);
        }}
      >
        <SquarePlus aria-hidden size={22} strokeWidth={1.75} />
      </button>
      {sheet && <InstallSheet platform={state.platform} onDone={() => setSheet(false)} onClose={() => setSheet(false)} />}
    </>
  );
}
