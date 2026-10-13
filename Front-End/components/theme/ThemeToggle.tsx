'use client';

import { useTheme } from '@/hooks/useTheme';
import { MoonIcon, SunIcon } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode `}
    >
      {resolvedTheme === 'dark' ? <SunIcon className="text-orchid-500 dark:text-orchid-300 cursor-pointer" />
        : <MoonIcon className="text-orchid-500 dark:text-orchid-300 cursor-pointer" />}
    </button>
  );
}

