import { ReactNode } from 'react';

interface CardProps {
  inset?: boolean;
  selected?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}

export default function Card({ inset = false, selected = false, className = '', children, onClick }: CardProps) {
  const tone = selected
    ? 'border-sienna bg-[rgba(138,61,34,.04)] dark:border-sienna-dark dark:bg-[rgba(217,140,95,.06)]'
    : inset
      ? 'border-paper-inset-border bg-paper-inset dark:border-charcoal-inset-border dark:bg-charcoal-inset'
      : 'border-paper-border bg-paper-card dark:border-charcoal-border dark:bg-charcoal-card';

  return (
    <div
      className={`rounded border ${tone} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
