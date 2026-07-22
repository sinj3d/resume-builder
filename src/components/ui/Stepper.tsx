interface StepperProps {
  steps: string[];
  /** 0-indexed: steps before this are done, this one is current, after are future. */
  current: number;
}

export default function Stepper({ steps, current }: StepperProps) {
  return (
    <div className="flex items-center gap-3.5 text-[12.5px]">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'future';
        return (
          <div key={label} className="flex items-center gap-3.5">
            {i > 0 && (
              <span
                className={`h-px w-9 ${
                  i <= current ? 'bg-[#3d6b35] dark:bg-[#6fae62]' : 'bg-paper-border dark:bg-charcoal-border'
                }`}
              />
            )}
            <span
              className={`flex items-center gap-2 font-semibold ${
                state === 'done'
                  ? 'text-[#3d6b35] dark:text-[#6fae62]'
                  : state === 'current'
                    ? 'text-sienna dark:text-sienna-dark'
                    : 'text-ink-muted dark:text-cream-muted'
              }`}
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] ${
                  state === 'done'
                    ? 'bg-[#3d6b35] text-paper dark:bg-[#6fae62] dark:text-charcoal'
                    : state === 'current'
                      ? 'bg-sienna text-paper dark:bg-sienna-dark dark:text-charcoal'
                      : 'border border-paper-border text-ink-muted dark:border-charcoal-border dark:text-cream-muted'
                }`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
