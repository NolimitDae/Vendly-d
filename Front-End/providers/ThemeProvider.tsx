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
  const [theme, setThemeState] = useState<Theme>(
    () => themeStorage.get() ?? defaultTheme
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? systemTheme : theme;

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;
    if (THEME_ATTRIBUTE === 'class') {
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(THEME_ATTRIBUTE, resolvedTheme);
    }
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

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