
export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'app-theme' as const;
export const THEME_ATTRIBUTE = 'class' as const;
export const DEFAULT_THEME: Theme = 'system';