'use client';

import { useState, useEffect } from 'react';
import { Bell, Moon, Sun, Settings, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Topbar() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = stored ? stored === 'dark' : prefersDark;
    setIsDark(initialDark);
    document.documentElement.classList.toggle('dark', initialDark);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <header className="h-16 shrink-0 border-b border-ink-100 dark:border-ink-800 bg-white/60 dark:bg-ink-900/60 backdrop-blur-xl flex items-center px-6 gap-4">
      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          type="text"
          placeholder="Search sellers, SKUs, emails…"
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-ink-50 dark:bg-ink-800 border border-transparent hover:border-ink-200 dark:hover:border-ink-700 focus:outline-none focus:ring-2 focus:ring-royal-500/30 focus:bg-white dark:focus:bg-ink-900 transition-all"
        />
        <kbd className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-ink-500">⌘K</kbd>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <button
          aria-label="Notifications"
          className="relative w-10 h-10 rounded-xl flex items-center justify-center text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
        >
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-magenta-500 ring-2 ring-white dark:ring-ink-900" />
        </button>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
        >
          {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>

        <button
          aria-label="Settings"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>

        <div className="w-px h-6 bg-ink-200 dark:bg-ink-700 mx-2" />

        <button className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-xl hover:bg-ink-100 dark:hover:bg-ink-800 transition">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-magenta-400 to-magenta-600 flex items-center justify-center text-white font-semibold text-sm shadow-pink">
            ZM
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="text-[13px] font-semibold text-ink-900 dark:text-white">Zaynah Mahmood</div>
            <div className="text-[11px] text-ink-500">Operations Admin</div>
          </div>
        </button>
      </div>
    </header>
  );
}
