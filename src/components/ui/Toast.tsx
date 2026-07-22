interface ToastProps {
  message: string | null;
  variant?: 'success' | 'error';
}

export default function Toast({ message, variant = 'success' }: ToastProps) {
  if (!message) return null;

  const tone =
    variant === 'success'
      ? 'bg-[#3d6b35]/10 text-[#3d6b35] border-[#3d6b35]/30 dark:bg-[#6fae62]/10 dark:text-[#6fae62] dark:border-[#6fae62]/30'
      : 'bg-[#a1453a]/10 text-[#a1453a] border-[#a1453a]/30 dark:bg-[#d97567]/10 dark:text-[#d97567] dark:border-[#d97567]/30';

  return (
    <div
      className={`absolute top-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 shadow-lg animate-in slide-in-from-top-4 fade-in duration-300 ${tone}`}
    >
      <span className="text-sm font-semibold">{message}</span>
    </div>
  );
}
