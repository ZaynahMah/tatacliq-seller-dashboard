export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 lg:mb-8 animate-fade-up">
      <div>
        <h1 className="font-display font-bold text-2xl lg:text-3xl text-ink-900 dark:text-white tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1.5 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
