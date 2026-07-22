import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export default function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded border border-dashed border-paper-border p-12 text-center text-ink-muted dark:border-charcoal-border dark:text-cream-muted">
      {Icon && <Icon size={44} className="opacity-30" />}
      <h3 className="font-serif text-lg font-semibold text-ink dark:text-cream">{title}</h3>
      <p className="max-w-xs text-sm">{description}</p>
    </div>
  );
}
