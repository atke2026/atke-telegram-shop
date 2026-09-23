import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { MaintenanceScreen, useGetMaintenanceQuery } from '@entities/maintenance';
import { JoinChannelScreen } from '@entities/membership';
import { useGetMeQuery } from '@entities/user';
import { FeedbackPrompt } from '@features/feedback';
import { TelegramAuthSheet } from '@features/telegram-auth';
import { OrdersPage } from '@pages/OrdersPage';
import { AdminUserPage } from '@pages/AdminUserPage';
import { MoneyAnalyticsPage } from '@pages/MoneyAnalyticsPage';
import { PanelPage } from '@pages/PanelPage';
import { StorePage } from '@pages/StorePage';
import { WalletPage } from '@pages/WalletPage';
import { Spinner } from '@shared/ui/Spinner';
import { hasConfirmedTelegram, rememberTelegramConfirmation } from '@shared/lib/telegram';
import { TopAppBar } from '@widgets/TopAppBar';

interface JoinRequirement {
  channel: string;
  joinUrl: string;
}

function getJoinRequirement(error: unknown): JoinRequirement | null {
  if (typeof error !== 'object' || error === null || !('status' in error) || !('data' in error)) {
    return null;
  }

  const result = error as { status?: unknown; data?: unknown };
  if (result.status !== 403 || typeof result.data !== 'object' || result.data === null) return null;

  const data = result.data as { error?: unknown; channel?: unknown; joinUrl?: unknown };
  if (
    data.error !== 'JOIN_CHANNEL_REQUIRED' ||
    typeof data.channel !== 'string' ||
    typeof data.joinUrl !== 'string'
  ) {
    return null;
  }

  return { channel: data.channel, joinUrl: data.joinUrl };
}

export function App() {
  const location = useLocation();
  const [telegramConfirmed, setTelegramConfirmed] = useState(hasConfirmedTelegram);
  const { data: maintenance, isLoading: maintenanceLoading } = useGetMaintenanceQuery(undefined, {
    skip: !telegramConfirmed,
  });
  // Admins keep full access during maintenance; everyone else sees the notice.
  const {
    data: me,
    isLoading: meLoading,
    isFetching: meFetching,
    error: meError,
    refetch: refetchMe,
  } = useGetMeQuery(undefined, { skip: !telegramConfirmed });
  const joinRequirement = getJoinRequirement(meError);

  if (!telegramConfirmed) {
    return (
      <TelegramAuthSheet
        onContinue={() => {
          rememberTelegramConfirmation();
          setTelegramConfirmed(true);
        }}
      />
    );
  }

  if (joinRequirement) {
    return (
      <JoinChannelScreen
        {...joinRequirement}
        isChecking={meFetching}
        onRetry={() => void refetchMe()}
      />
    );
  }

  if (maintenanceLoading || meLoading) return <Spinner />;

  if (maintenance?.enabled && !me?.isAdmin) {
    return <MaintenanceScreen message={maintenance.message} imageUrl={maintenance.imageUrl} />;
  }

  return (
    <>
      <TopAppBar />
      {/* keyed by path so AnimatePresence can run the exit transition */}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<StorePage />} />
          <Route path="/profile" element={<WalletPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/panel" element={<PanelPage />} />
          <Route path="/panel/analytics" element={<MoneyAnalyticsPage />} />
          <Route path="/panel/users/:telegramId" element={<AdminUserPage />} />
          <Route path="*" element={<StorePage />} />
        </Routes>
      </AnimatePresence>

      {/* Outside the routed area on purpose: the prompt is timed, and a page
          change mid-countdown must not restart or cancel it. */}
      <FeedbackPrompt />
    </>
  );
}
