// Brand palette from the VM logo (2026 rebrand), matching the website's plum tokens.
export const COLORS = {
  primary: '#7A2A82',
  primaryDark: '#5E1B66',
  primaryLight: '#A84AB0',
  primaryBg: '#F3E6F0',
  white: '#ffffff',
  black: '#0a0a0a',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  status: {
    PLANNING: { bg: '#fefce8', text: '#a16207', border: '#fde047' },
    CONFIRMED: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
    IN_PROGRESS: { bg: '#F3E6F0', text: '#7A2A82', border: '#D9A6DD' },
    COMPLETED: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
    CANCELLED: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
  },
} as const;

// Dark surfaces for the Figma screens (onboarding, auth, home), tinted plum instead of Figma's blue-black.
export const DARK = {
  bg: '#14061A',
  card: '#24102A',
  field: '#34183B',
  text: '#ffffff',
  muted: '#B7A6BA',
  accent: '#D9A6DD',
  border: '#A84AB0',
} as const;

export const BRAND_GRADIENT = ['#4A1650', '#7A2A82', '#A84AB0'] as const;
export const BRAND_GRADIENT_STOPS = [0, 0.52, 1] as const;

export const FONTS = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;
