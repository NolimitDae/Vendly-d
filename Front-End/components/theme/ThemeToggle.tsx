'use client';

import { useTheme } from '@/hooks/useTheme';
import { MoonIcon, SunIcon } from 'lucide-react';

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  // Icons switch with CSS on <html class="dark"> (set by ThemeScript before paint), so server and client markup
  // match. Keyed to <html>, not `dark:`, because the home navbar is always styled dark over the hero.
  return (
    <button type="button" onClick={toggleTheme} aria-label="Toggle dark mode" className="cursor-pointer">
      <MoonIcon className="text-orchid-500 dark:text-orchid-300 [html.dark_&]:hidden" />
      <SunIcon className="hidden text-orchid-300 [html.dark_&]:block" />
    </button>
  );
}

