import { ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost-text';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  pill?: boolean;
  size?: 'sm' | 'md';
  /** variant="outline" only: a stronger black/cream border instead of the light muted one
   *  (the mockups use both — e.g. "Begin writing"/"Add" vs. "Re-parse"). */
  strong?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:opacity-90 dark:bg-cream dark:text-charcoal',
  accent: 'bg-sienna text-paper hover:opacity-90 dark:bg-sienna-dark dark:text-charcoal',
  outline:
    'border border-paper-border bg-paper-card text-ink-muted-2 hover:bg-paper-inset dark:border-charcoal-border dark:bg-charcoal-card dark:text-cream-muted dark:hover:bg-charcoal-inset',
  'ghost-text': 'bg-transparent text-ink-muted hover:text-ink dark:text-cream-muted dark:hover:text-cream font-medium',
};

const OUTLINE_STRONG =
  'border border-ink bg-transparent text-ink hover:bg-paper-inset dark:border-cream dark:text-cream dark:hover:bg-charcoal-inset';

const SIZE_CLASSES = {
  sm: 'px-4 py-2 text-[13px]',
  md: 'px-[22px] py-[11px] text-sm',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', pill = false, size = 'md', strong = false, className = '', children, ...rest },
  ref,
) {
  const isGhost = variant === 'ghost-text';
  const shapeAndSize = isGhost
    ? 'px-0 py-0 text-[12.5px]'
    : pill
      ? 'rounded-full px-3.5 py-1.5 text-xs'
      : `rounded ${SIZE_CLASSES[size]}`;
  const tone = variant === 'outline' && strong ? OUTLINE_STRONG : VARIANT_CLASSES[variant];

  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${shapeAndSize} ${tone} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
