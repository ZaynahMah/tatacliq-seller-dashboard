import { cn } from '@/lib/utils';
import type { EmailStatus } from '@/lib/mock-data';

const statusConfig: Record<EmailStatus, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
    dot: 'bg-ink-400',
  },
  processing: {
    label: 'Processing',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    dot: 'bg-sky-500 animate-pulse-dot',
  },
  enriched: {
    label: 'Enriched',
    className: 'bg-royal-100 text-royal-700 dark:bg-royal-900/30 dark:text-royal-200',
    dot: 'bg-royal-500',
  },
  validated: {
    label: 'Validated',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    dot: 'bg-green-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    dot: 'bg-red-500',
  },
  awaiting_seller: {
    label: 'Awaiting Seller',
    className: 'bg-magenta-100 text-magenta-700 dark:bg-magenta-900/30 dark:text-magenta-300',
    dot: 'bg-magenta-500',
  },
};

export function StatusPill({ status }: { status: EmailStatus }) {
  const cfg = statusConfig[status];
  return (
    <span className={cn('pill', cfg.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function ConfidenceBadge({ score }: { score: number }) {
  const tier = score >= 90 ? 'high' : score >= 75 ? 'mid' : 'low';
  const classes = {
    high: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    mid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }[tier];

  return (
    <span className={cn('pill tabular-nums font-semibold', classes)}>
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M12 2l2.4 7.2H22l-6 4.4 2.4 7.2-6-4.4-6 4.4 2.4-7.2-6-4.4h7.6z"/></svg>
      {score}% AI
    </span>
  );
}
