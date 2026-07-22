import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-[36px] font-semibold tracking-[-0.015em] text-ink dark:text-cream">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 font-serif text-[15px] italic text-ink-muted dark:text-cream-muted">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
