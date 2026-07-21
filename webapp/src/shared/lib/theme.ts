import { getWebApp } from './telegram';

/**
 * Theme selection.
 *
 * `telegram` is the default and simply follows the client, including live
 * changes. `light` and `dark` pin the app regardless of what Telegram is
 * doing, which people want when the client theme is hard to read or they
 * prefer the shop a particular way.
 */
export type ThemeMode = 'telegram' | 'light' | 'dark';

const STORAGE_KEY = 'yeneshop:theme';

export const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: 'telegram', label: 'Use Telegram theme' },
  { id: 'light', label: 'Day mode' },
  { id: 'dark', label: 'Night mode' },
];

export function getThemeMode(): ThemeMode {
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
    return;
  }

  root.dataset.themeMode = mode;
  root.dataset.theme = mode;
}

export function setThemeMode(mode: ThemeMode): void {
  if (mode === 'telegram') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, mode);

  applyThemeMode(mode);
}

/** Re-applies the current choice; used when Telegram reports a theme change. */
export function refreshThemeMode(): void {
  applyThemeMode(getThemeMode());
}
