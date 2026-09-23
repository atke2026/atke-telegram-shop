/**
 * Single point of contact with the Telegram Mini App SDK.
 *
 * Everything here degrades gracefully: opened in a plain browser tab during
 * development `window.Telegram` is undefined, and the app must still render
 * rather than crash on startup.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramUser;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportStableHeight: number;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink?(url: string): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: NotificationType): void;
    selectionChanged(): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

// Imported after the type declarations so theme.ts can read colorScheme.
// eslint-disable-next-line import/first
import { refreshThemeMode } from './theme';

export function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function isInsideTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}

/**
 * Telegram normally exposes initData through its SDK. Some desktop clients
 * paint the page before that object is hydrated, while the same signed value
 * is already present in the launch URL as tgWebAppData. Reading both paths
 * avoids trapping a real Telegram user on a disabled sign-in sheet.
 */
function getLaunchInitData(): string {
  const sources = [window.location.hash.replace(/^#/, ''), window.location.search.replace(/^\?/, '')];
  for (const source of sources) {
    if (!source) continue;
    const value = new URLSearchParams(source).get('tgWebAppData');
    if (value) return value;
  }
  return '';
}

/**
 * The credential for every API call. Sent raw; the server re-verifies its HMAC
 * on each request, so there is no token to store or refresh.
 */
export function getInitData(): string {
  const fromTelegram = getWebApp()?.initData;
  if (fromTelegram) return fromTelegram;

  const fromLaunchUrl = getLaunchInitData();
  if (fromLaunchUrl) return fromLaunchUrl;

  // Development only: lets the UI be opened in a plain browser tab by pasting
  // a signed string into localStorage (see server/scripts/dev-init-data.ts).
  // Stripped from production builds, and the server verifies the HMAC either
  // way, so this can never be used to forge a session.
  if (import.meta.env.DEV) return localStorage.getItem('dev:initData') ?? '';

  return '';
}

/** Safe display-only Telegram profile data; authentication still uses initData. */
export function getTelegramUser() {
  const fromSdk = getWebApp()?.initDataUnsafe?.user;
  if (fromSdk) return fromSdk;

  // Display-only fallback. The raw value is still sent to the server and its
  // signature is verified before this identity is trusted for authentication.
  const rawUser = new URLSearchParams(getInitData()).get('user');
  if (!rawUser) return undefined;
  try {
    const parsed = JSON.parse(rawUser) as TelegramUser;
    return typeof parsed?.id === 'number' && typeof parsed.first_name === 'string'
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export function openSuqBot(): void {
  // The start payload makes the bot immediately return its authenticated Web
  // App keyboard instead of leaving a first-time visitor on an idle bot page.
  const url = 'https://t.me/atkedigitalbot?start=webapp';
  const webApp = getWebApp();
  if (webApp?.openTelegramLink) webApp.openTelegramLink(url);
  else window.location.assign(url);
}

const CONFIRMATION_KEY_PREFIX = 'suq:telegram-confirmed:';

/** Cosmetic consent memory only; every API request still verifies initData. */
export function hasConfirmedTelegram(): boolean {
  const user = getTelegramUser();
  if (!getInitData() || !user) return false;
  try {
    return localStorage.getItem(`${CONFIRMATION_KEY_PREFIX}${user.id}`) === '1';
  } catch {
    return false;
  }
}

export function rememberTelegramConfirmation(): void {
  const user = getTelegramUser();
  if (!getInitData() || !user) return;
  try {
    localStorage.setItem(`${CONFIRMATION_KEY_PREFIX}${user.id}`, '1');
  } catch {
    // Storage can be disabled; authentication still works for this launch.
  }
}

export function initTelegram(): void {
  const webApp = getWebApp();

  // The stored preference is applied either way: the app may be open in a
  // browser tab, where there is no Telegram to follow.
  refreshThemeMode();
  if (!webApp) return;

  webApp.ready();
  webApp.expand();

  // Only changes the palette for people who explicitly chose Telegram;
  // refreshThemeMode keeps Day/Night pinned.
  const onThemeChanged = () => refreshThemeMode();
  webApp.onEvent('themeChanged', onThemeChanged);
}

export const haptics = {
  tap(style: HapticStyle = 'light'): void {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
  },
  notify(type: NotificationType): void {
    getWebApp()?.HapticFeedback?.notificationOccurred(type);
  },
  select(): void {
    getWebApp()?.HapticFeedback?.selectionChanged();
  },
};
