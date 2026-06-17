import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-6', className)} {...props}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  deltaPositive = true,
  icon,
  accent = 'royal',
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  icon?: React.ReactNode;
  accent?: 'royal' | 'pink' | 'sky' | 'green';
}) {
  const accentClasses = {
    royal: 'from-royal-500/10 to-royal-600/0 text-royal-600 dark:text-royal-300',
    pink: 'from-magenta-500/10 to-magenta-600/0 text-magenta-600 dark:text-magenta-300',
    sky: 'from-sky-400/10 to-sky-500/0 text-sky-600 dark:text-sky-300',
    green: 'from-green-500/10 to-green-600/0 text-green-600 dark:text-green-300',
  }[accent];

  return (
    <div className="card p-5 relative overflow-hidden group hover:shadow-lift transition-shadow">
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-50 pointer-events-none', accentClasses)} />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-medium text-ink-500 dark:text-ink-400">{label}</div>
          {icon && <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-white/80 dark:bg-ink-900/80', accentClasses)}>{icon}</div>}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display font-bold text-3xl text-ink-900 dark:text-white tabular-nums">{value}</span>
          {delta && (
            <span className={cn('text-[12px] font-semibold tabular-nums', deltaPositive ? 'text-green-600' : 'text-red-600')}>
              {deltaPositive ? '↑' : '↓'} {delta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
