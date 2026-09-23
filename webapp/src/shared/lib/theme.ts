import { getWebApp } from './telegram';

/**
 * Theme selection.
 *
 * Day mode is the shop default. Telegram and Night remain explicit choices.
 */
export type ThemeMode = 'telegram' | 'light' | 'dark';

const STORAGE_KEY = 'suq:theme';
const DEFAULT_VERSION_KEY = 'suq:theme-default-version';
const DAY_DEFAULT_VERSION = 'day-v1';

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'telegram', label: 'Use Telegram theme' },
  { id: 'light', label: 'Day mode' },
  { id: 'dark', label: 'Night mode' },
];

export function getThemeMode(): ThemeMode {
  // One-time migration as well as the new-user default. Existing customers
  // are moved to Day once for this release; anything they choose afterwards
  // persists because the version marker is already current.
  if (localStorage.getItem(DEFAULT_VERSION_KEY) !== DAY_DEFAULT_VERSION) {
    localStorage.setItem(STORAGE_KEY, 'light');
    localStorage.setItem(DEFAULT_VERSION_KEY, DAY_DEFAULT_VERSION);
    return 'light';
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'telegram';
}

/**
 * Writes both attributes the stylesheet needs: `data-theme-mode` swaps the
 * palette, `data-theme` drives the border and shadow inversion that a dark
 * surface requires.
 */
export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;

  if (mode === 'telegram') {
    delete root.dataset.themeMode;
    root.dataset.theme = getWebApp()?.colorScheme ?? 'light';
  } else {
    root.dataset.themeMode = mode;
    root.dataset.theme = mode;
  }

  // Keep Telegram's surrounding chrome aligned with the app even when Day is
  // pinned inside a Telegram client that itself is using a dark theme.
  const webApp = getWebApp();
  const chrome =
    mode === 'light'
      ? '#f2f2f7'
      : mode === 'dark'
        ? '#0e1621'
        : webApp?.themeParams.secondary_bg_color ?? webApp?.themeParams.bg_color;
  if (chrome) {
    webApp?.setHeaderColor?.(chrome);
    webApp?.setBackgroundColor?.(chrome);
  }
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(DEFAULT_VERSION_KEY, DAY_DEFAULT_VERSION);
  if (mode === 'telegram') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, mode);

  applyThemeMode(mode);
}

/** Re-applies the current choice; used when Telegram reports a theme change. */
export function refreshThemeMode(): void {
  applyThemeMode(getThemeMode());
}
