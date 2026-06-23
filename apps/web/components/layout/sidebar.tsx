'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Sparkles, Inbox, ImageIcon } from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  badge?: 'SOON' | 'BETA';
};

// Exactly three nav items — the only product surfaces that exist.
// Nothing else in the sidebar to mis-click into.
const NAV: NavItem[] = [
  { name: 'Enrichment Dashboard', href: '/upload',  icon: Sparkles },
  { name: 'Fetch from Email',     href: '/inbox',   icon: Inbox,      badge: 'SOON' },
  { name: 'AI Image Studio',      href: '/studio',  icon: ImageIcon,  badge: 'BETA' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-ink-100 dark:border-ink-800 bg-white/60 dark:bg-ink-900/60 backdrop-blur-xl">
      {/* Header — product identity */}
      <div className="px-5 py-5 border-b border-ink-100 dark:border-ink-800">
        <Link href="/upload" className="block">
          <div className="font-display font-bold text-base text-ink-900 dark:text-white leading-tight">
            Catalogue Enrichment
          </div>
          <div className="text-[11px] text-ink-500 mt-1 leading-snug">
            Tata CLiQ Fashion · seller data QA &amp; enrichment
          </div>
          <div className="text-[11px] text-ink-400 mt-2">
            Built by Zaynah Mahmood · Catalog Team
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href
            || (item.href === '/upload' && (pathname === '/' || pathname === '/dashboard'));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn('nav-item', isActive && 'nav-item-active')}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.4 : 2} />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md',
                    item.badge === 'SOON'
                      ? 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                      : 'bg-magenta-100 text-magenta-700 dark:bg-magenta-700/20 dark:text-magenta-300',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
