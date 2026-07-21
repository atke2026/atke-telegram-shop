/**
 * Single point of contact with the Telegram Mini App SDK.
 *
 * Everything here degrades gracefully: opened in a plain browser tab during
 * development `window.Telegram` is undefined, and the app must still render
 * rather than crash on startup.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportStableHeight: number;
  ready(): void;
  expand(): void;
  close(): void;
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

export function getWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

export function isInsideTelegram(): boolean {
  return Boolean(getWebApp()?.initData);
}

/**
 * The credential for every API call. Sent raw; the server re-verifies its HMAC
 * on each request, so there is no token to store or refresh.
 */
export function getInitData(): string {
  const fromTelegram = getWebApp()?.initData;
  if (fromTelegram) return fromTelegram;

  // Development only: lets the UI be opened in a plain browser tab by pasting
  // a signed string into localStorage (see server/scripts/dev-init-data.ts).
  // Stripped from production builds, and the server verifies the HMAC either
  // way, so this can never be used to forge a session.
  if (import.meta.env.DEV) return localStorage.getItem('dev:initData') ?? '';

  return '';
}

/** Mirrors Telegram's colour scheme onto the root element for theme.css. */
function applyColorScheme(webApp: TelegramWebApp): void {
  document.documentElement.dataset.theme = webApp.colorScheme;
}

export function initTelegram(): void {
  const webApp = getWebApp();
  if (!webApp) return;

  webApp.ready();
  webApp.expand();
  applyColorScheme(webApp);

  const onThemeChanged = () => applyColorScheme(webApp);
  webApp.onEvent('themeChanged', onThemeChanged);

  // Match the header and background to the app's own surface colour.
  const background = webApp.themeParams.secondary_bg_color ?? webApp.themeParams.bg_color;
  if (background) {
    webApp.setHeaderColor?.(background);
    webApp.setBackgroundColor?.(background);
  }
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
