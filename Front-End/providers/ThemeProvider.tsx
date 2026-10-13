'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Theme,
  ResolvedTheme,
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
} from '@/lib/theme/constants';
import { themeStorage } from '@/lib/theme/storage';
import { getSystemTheme, subscribeToSystemTheme } from '@/lib/theme/detector';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: ThemeProviderProps) {
  // Start from the same values the server renders with, then read the saved choice after mount.
  // Reading localStorage during the first render made client and server disagree (hydration errors).
  // ThemeScript has already put the right class on <html> before paint, so nothing flashes.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(themeStorage.get() ?? defaultTheme);
    setSystemTheme(getSystemTheme());
    setMounted(true);
  }, [defaultTheme]);

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : theme;

  // Apply theme to DOM (only once the saved choice is known, so we never overwrite ThemeScript's class)
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (THEME_ATTRIBUTE === 'class') {
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
    }
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, mounted]);

  // Sync system theme changes in real time
  useEffect(() => {
    if (theme !== 'system') return;
    return subscribeToSystemTheme(setSystemTheme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    themeStorage.set(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}