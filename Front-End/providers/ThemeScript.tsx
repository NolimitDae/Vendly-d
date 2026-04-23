import { THEME_STORAGE_KEY, THEME_ATTRIBUTE, DEFAULT_THEME } from '@/lib/theme';

// Stringified to run as inline blocking script
function themeInitScript(
  storageKey: string,
  themeAttribute: string,
  defaultTheme: string
) {
  const stored = localStorage.getItem(storageKey);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved =
    stored === 'dark' || (!stored && systemDark && defaultTheme === 'system')
      ? 'dark'
      : 'light';

  if (themeAttribute === 'class') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolved);
  } else {
    document.documentElement.setAttribute(themeAttribute, resolved);
  }
  document.documentElement.style.colorScheme = resolved;
}

export function ThemeScript() {
  const scriptContent = `(${themeInitScript.toString()})(
    '${THEME_STORAGE_KEY}',
    '${THEME_ATTRIBUTE}',
    '${DEFAULT_THEME}'
  )`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: scriptContent }}
      suppressHydrationWarning
    />
  );
}