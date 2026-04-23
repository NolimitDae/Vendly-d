import { Theme, THEME_STORAGE_KEY } from './constants';

export const themeStorage = {
  get(): Theme | null {
    if (typeof window === 'undefined') return null;
    try {
      return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? null;
    } catch {
      return null; // Handle SSR / private browsing
    }
  },

  set(theme: Theme): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Silently fail in restricted environments
    }
  },

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {}
  },
};