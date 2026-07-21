import { useEffect } from 'react';

import { getWebApp } from './telegram';

/**
 * Shows Telegram's native back button while a detail screen is open, so the
 * app is dismissed the way users expect rather than through an in-page control.
 * A no-op outside Telegram.
 */
export function useTelegramBackButton(onBack: () => void): void {
  useEffect(() => {
    const backButton = getWebApp()?.BackButton;
    if (!backButton) return;

    backButton.onClick(onBack);
    backButton.show();

    return () => {
      backButton.offClick(onBack);
      backButton.hide();
    };
  }, [onBack]);
}
