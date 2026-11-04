// 개인정보 처리방침 (2026-10-29 의뢰인: 「없으면 넣어 줘」 — 부록 1.5판 R-5의 4). 로그인 없이도 열린다(동의 창에서 전체를 보러 온다).
// 아직 검토 전 초안이라 맨 위에 「초안」 표시를 둔다 — 노무 · 개인정보 검토(결정 운영-4)를 마치면 시행일을 적고 표시를 지운다.
// 보관 기간은 결정 운영-3의 임시 기준(검증 대기 기록 6장). 안내문을 고쳐도 동의 판(src/config/consent.ts)은 올리지 않는다 — 동의 창 문구가 따로다.
import { ArrowLeft, MapPin, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { Card, PageShell } from '@/components/ui';
import { companyName, companyProfile } from '@/lib/company';
import { languageOptions } from '@/i18n/locales';
import { getMe } from '@/lib/auth';
import { homePathForRole } from '@/lib/home-path';

const ITEMS = ['basic', 'details', 'work', 'location', 'device', 'pay', 'consent'] as const;
const KEEP = ['work', 'pay', 'location', 'details', 'consent', 'logs', 'backup'] as const;
const ENTRUST = ['supabase', 'vercel', 'push'] as const;
const SAFETY = ['admins', 'records', 'logs', 'backup', 'slip'] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default async function PrivacyPage() {
  const [t, me, company, profile] = await Promise.all([getTranslations('privacy'), getMe(), companyName(), companyProfile()]);
  const officer = profile.privacyOfficer?.trim();
  const back = me ? homePathForRole() : '/login';
  return (
    <PageShell>
      <div className="flex items-center justify-between gap-2">
        <Logo height={32} priority />
        <LanguageSwitcher options={languageOptions()} />
      </div>
      <Card className="flex flex-col gap-5 text-sm">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-primary-deep">
          <ShieldCheck aria-hidden size={26} strokeWidth={1.75} />
          {t('title')}
        </h1>
        <p className="rounded-button bg-warn-tint p-3 font-semibold text-warn">{t('draft')}</p>
        <p className="text-muted">{t('intro', { company })}</p>

        <Section title={t('itemsTitle')}>
          <ul className="flex flex-col gap-2">
            {ITEMS.map((k) => (
              <li key={k} className="rounded-button bg-surface p-3">
                <p className="font-semibold">{t(`item.${k}.name`)}</p>
                <p className="text-muted">{t(`item.${k}.detail`)}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted">{t('notCollected')}</p>
          {/* 위치는 따로 약관이 있다 (2026-11-04 의뢰인) */}
          <Link prefetch={false} href="/privacy/location" className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-primary">
            <MapPin aria-hidden size={16} />
            {t('locationLink')} ›
          </Link>
        </Section>

        <Section title={t('purposeTitle')}>
          <p className="text-muted">{t('purpose')}</p>
        </Section>

        <Section title={t('keepTitle')}>
          <dl className="flex flex-col divide-y divide-border rounded-button bg-surface">
            {KEEP.map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="min-w-0">{t(`keep.${k}.name`)}</dt>
                <dd className="shrink-0 font-semibold">{t(`keep.${k}.period`)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted">{t('keepNote')}</p>
        </Section>

        <Section title={t('entrustTitle')}>
          <ul className="flex flex-col gap-2">
            {ENTRUST.map((k) => (
              <li key={k} className="rounded-button bg-surface p-3">
                <p className="font-semibold">{t(`entrust.${k}.name`)}</p>
                <p className="text-muted">{t(`entrust.${k}.detail`)}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted">{t('entrustNote')}</p>
        </Section>

        <Section title={t('shareTitle')}>
          <p className="text-muted">{t('share')}</p>
        </Section>

        <Section title={t('safetyTitle')}>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
            {SAFETY.map((k) => (
              <li key={k}>{t(`safety.${k}`)}</li>
            ))}
          </ul>
        </Section>

        <Section title={t('rightsTitle')}>
          <p className="text-muted">{t('rights')}</p>
        </Section>

        <Section title={t('officerTitle')}>
          <p className="text-muted">{officer ? t('officer', { name: officer }) : t('officerNone')}</p>
        </Section>

        <Section title={t('changeTitle')}>
          <p className="text-muted">{t('change')}</p>
        </Section>

        <p className="text-xs text-faint">{t('effective')}</p>
      </Card>
      <Link prefetch={false} href={back} className="flex min-h-11 items-center justify-center gap-1 text-sm text-primary">
        <ArrowLeft aria-hidden size={16} />
        {t('back')}
      </Link>
    </PageShell>
  );
}
