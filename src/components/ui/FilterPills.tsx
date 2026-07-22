interface FilterPillOption {
  key: string;
  label: string;
  count?: number;
}

interface FilterPillsProps {
  options: FilterPillOption[];
  active: string;
  onChange: (key: string) => void;
}

export default function FilterPills({ options, active, onChange }: FilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`rounded-full px-4 py-[7px] text-[12.5px] transition-colors ${
              isActive
                ? 'bg-ink font-semibold text-paper dark:bg-cream dark:text-charcoal'
                : 'border border-paper-border bg-paper-card font-medium text-ink-muted-2 hover:border-ink-muted dark:border-charcoal-border dark:bg-charcoal-card dark:text-cream-muted'
            }`}
          >
            {opt.label}
            {opt.count !== undefined ? ` · ${opt.count}` : ''}
          </button>
        );
      })}
    </div>
  );
}
