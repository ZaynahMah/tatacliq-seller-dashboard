'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

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
    <header className="h-14 shrink-0 border-b border-ink-100 dark:border-ink-800 bg-white/60 dark:bg-ink-900/60 backdrop-blur-xl flex items-center justify-end px-6 gap-2">
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
      >
        {isDark ? <Sun className="w-[17px] h-[17px]" /> : <Moon className="w-[17px] h-[17px]" />}
      </button>

      <div className="flex items-center gap-2.5 pl-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-magenta-400 to-magenta-600 flex items-center justify-center text-white font-semibold text-sm shadow-pink">
          ZM
        </div>
        <div className="hidden md:block text-left leading-tight">
          <div className="text-[13px] font-semibold text-ink-900 dark:text-white">Zaynah Mahmood</div>
          <div className="text-[11px] text-ink-500">Catalog Team</div>
        </div>
      </div>
    </header>
  );
}
