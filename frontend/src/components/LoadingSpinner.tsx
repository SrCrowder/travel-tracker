import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function LoadingSpinner({
  fullPage = true,
  size = 'md',
  message = 'Loading…',
}: LoadingSpinnerProps) {
  const sizes = { sm: 'w-6 h-6', md: 'w-10 h-10', lg: 'w-16 h-16' };

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className={`${sizes[size]} rounded-full border-3 border-primary-200 border-t-primary-600`}
        style={{ borderWidth: 3 }}
      />
      {message && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      )}
    </div>
  );

  if (!fullPage) return spinner;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      {spinner}
    </div>
  );
}
