import { ReactNode } from 'react';

interface CategoryLabelProps {
  children: ReactNode;
  muted?: boolean;
}

export default function CategoryLabel({ children, muted = false }: CategoryLabelProps) {
  return (
    <span
      className={`text-[10.5px] font-semibold uppercase tracking-[.05em] ${
        muted ? 'text-ink-muted dark:text-cream-muted' : 'text-sienna dark:text-sienna-dark'
      }`}
    >
      {children}
    </span>
  );
}
