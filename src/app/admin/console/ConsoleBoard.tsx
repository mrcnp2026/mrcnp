'use client';
// 통합설정 첫 화면의 전체 메뉴 — 회사설정 · App 관리 묶음 카드 (2026-10-14 결정 사항 개발-20).
// 2026-10-15 폰(< 1024px): 묶음 13개 · 항목 50개가 다 펼쳐져 화면 3.4장 길이였다(모바일 분석 13) —
//   폰에서는 묶음 이름만 보이고 누르면 펼친다. 맨 위 「설정 찾기」에 쓰면 맞는 항목만 펼쳐 보인다. PC는 지금처럼 다 펼친다.
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { appLeaves, appsFor } from '@/config/nav';
import { useSystemNav } from '@/components/SystemNav';

export function ConsoleBoard() {
  const t = useTranslations('frame');
  const system = useSystemNav();
  const [q, setQ] = useState('');
  const [phone, setPhone] = useState(false);
  const [unfold, setUnfold] = useState<Set<string>>(new Set());
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1023.98px)');
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const word = q.trim().toLowerCase();
  // 한 번에 한 묶음만 펼친다 — 「기본」을 펼친 채 「조직」을 누르면 「기본」은 저절로 접힌다 (2026-10-19 의뢰인)
  const toggle = (k: string) => setUnfold((s) => (s.has(k) ? new Set() : new Set([k])));
  const sections = (['company', 'apps'] as const).map((s) => ({
    s,
    apps: appsFor('console', 'admin', system).filter((a) => a.section === s)
      .map((a) => {
        const name = t(`app.${a.key}`);
        const leaves = appLeaves(a).filter((l) => !word || `${t(`item.${l.key}`)} ${name}`.toLowerCase().includes(word));
        return { a, name, leaves };
      })
      .filter((x) => x.leaves.length > 0),
  }));

  return (
    <>
      <label className="flex h-11 items-center gap-2 rounded-button border border-border bg-bg px-3 text-faint focus-within:border-primary lg:max-w-sm">
        <Search aria-hidden size={16} strokeWidth={1.75} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('console.find')} aria-label={t('console.find')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint" />
      </label>
      {word && sections.every((x) => x.apps.length === 0) && <p className="text-sm text-faint">{t('console.none')}</p>}
      {sections.map(({ s, apps }) =>
        apps.length === 0 ? null : (
          <section key={s} className="flex flex-col gap-3 pt-2">
            <div>
              <h2 className="text-lg font-bold">{t(`console.${s}`)}</h2>
              <p className="text-sm text-faint">{t(`console.${s}Lead`)}</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:gap-3 xl:grid-cols-4">
              {apps.map(({ a, name, leaves }) => {
                const Icon = a.icon;
                const isOpen = !phone || !!word || unfold.has(a.key);
                return (
                  <div key={a.key} className="rounded-card border border-border bg-bg p-2 lg:p-4">
                    <button type="button" aria-expanded={isOpen} onClick={() => toggle(a.key)} className="flex min-h-11 w-full items-center gap-2 px-2 text-left font-bold lg:pointer-events-none lg:min-h-0 lg:px-0 lg:pb-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-button bg-primary-tint text-primary">
                        <Icon aria-hidden size={18} strokeWidth={1.75} />
                      </span>
                      <span className="flex-1">{name}</span>
                      <span className="num text-xs font-normal text-faint lg:hidden">{leaves.length}</span>
                      <ChevronDown aria-hidden size={16} className={`shrink-0 text-faint transition-transform duration-[350ms] lg:hidden ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <ul>
                        {leaves.map((l) => (
                          <li key={l.href}>
                            <Link href={l.href} className="flex min-h-11 items-center justify-between gap-2 rounded-button px-2 text-sm text-text hover:bg-surface hover:text-primary lg:min-h-9">
                              {t(`item.${l.key}`)}
                              <ChevronRight aria-hidden size={14} strokeWidth={1.75} className="text-faint" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ),
      )}
    </>
  );
}
