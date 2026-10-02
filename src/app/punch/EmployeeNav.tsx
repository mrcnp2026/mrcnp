'use client';
import { House, ListChecks, PencilLine, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; key: 'home' | 'records' | 'corrections'; icon: LucideIcon }[] = [
  { href: '/punch', key: 'home', icon: House },
  { href: '/punch/records', key: 'records', icon: ListChecks },
  { href: '/punch/corrections', key: 'corrections', icon: PencilLine },
];

export function EmployeeNav() {
  const t = useTranslations('nav');
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = href === '/punch' ? path === '/punch' : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? 'font-semibold text-primary-deep' : 'text-muted'}`}
              >
                <Icon aria-hidden size={22} strokeWidth={1.75} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
