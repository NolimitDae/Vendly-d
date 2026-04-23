import { ResolvedTheme } from './constants';

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function subscribeToSystemTheme(
  callback: (theme: ResolvedTheme) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) =>
    callback(e.matches ? 'dark' : 'light');

  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler); // Cleanup
}