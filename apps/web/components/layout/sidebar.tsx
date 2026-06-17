'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Inbox,
  Upload,
  ListChecks,
  Sparkles,
  MessageSquare,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Eye,
  Coins,
} from 'lucide-react';

type NavItem = {
  name: string;
  href: string;
  icon: any;
  badge?: number | string;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'AI Pipelines',
    items: [
      { name: 'Upload Catalog', href: '/upload', icon: Upload, badge: 'NEW' },
      { name: 'AI Image Studio', href: '/studio', icon: Sparkles, badge: 'NEW' },
      { name: 'Enrichment Preview', href: '/enrichment', icon: Eye },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Inbox', href: '/inbox', icon: Inbox, badge: 'SOON' },
      { name: 'Processing Queue', href: '/queue', icon: ListChecks, badge: 23 },
      { name: 'Seller Comms', href: '/communications', icon: MessageSquare },
      { name: 'Master Sheets', href: '/sheets', icon: FileSpreadsheet },
    ],
  },
  {
    label: 'Insights',
    items: [
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
      { name: 'Usage & Cost', href: '/usage', icon: Coins, badge: 'NEW' },
      { name: 'Admin Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-ink-100 dark:border-ink-800 bg-white/60 dark:bg-ink-900/60 backdrop-blur-xl">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-ink-100 dark:border-ink-800">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-royal-600 to-royal-800 flex items-center justify-center shadow-lift">
              <span className="text-white font-display font-bold text-sm">T</span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-magenta-500 ring-2 ring-white dark:ring-ink-900" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-[15px] text-ink-900 dark:text-white">TataCLiQ</div>
            <div className="text-[11px] text-ink-500 -mt-0.5">Seller Dashboard</div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto scrollbar-thin">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            {section.label && (
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (pathname === '/' && item.href === '/dashboard');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn('nav-item', isActive && 'nav-item-active')}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.4 : 2} />
                    <span className="flex-1">{item.name}</span>
                    {item.badge !== undefined && (
                      <span
                        className={cn(
                          'text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md min-w-[22px] text-center',
                          isActive
                            ? 'bg-royal-600 text-white'
                            : typeof item.badge === 'string'
                              ? 'bg-magenta-100 text-magenta-700 dark:bg-magenta-700/20 dark:text-magenta-300'
                              : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer card */}
      <div className="p-3">
        <div className="rounded-xl bg-gradient-to-br from-royal-600 to-royal-800 p-4 text-white shadow-lift">
          <div className="text-xs font-medium opacity-90">Gemini Pro</div>
          <div className="font-display font-bold text-lg mt-0.5">Connected</div>
          <div className="text-[11px] opacity-75 mt-1">zaynah15mahmood@gmail.com</div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot" />
            <span className="text-[11px] opacity-90">8,420 / 10,000 calls today</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
