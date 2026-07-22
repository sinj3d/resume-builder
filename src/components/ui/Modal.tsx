import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, footer, maxWidth = 'max-w-lg', children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`flex w-full ${maxWidth} mx-4 max-h-[85vh] flex-col rounded border border-paper-border bg-paper-card shadow-2xl animate-in zoom-in-95 fade-in duration-200 dark:border-charcoal-border dark:bg-charcoal-card`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-paper-inset-border p-5 dark:border-charcoal-inset-border">
            <h3 className="font-serif text-lg font-semibold text-ink dark:text-cream">{title}</h3>
            <button
              onClick={onClose}
              className="text-ink-muted hover:text-ink dark:text-cream-muted dark:hover:text-cream"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-paper-inset-border p-5 dark:border-charcoal-inset-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
