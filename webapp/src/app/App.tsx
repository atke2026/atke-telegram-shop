import { AnimatePresence } from 'framer-motion';
import { Route, Routes, useLocation } from 'react-router-dom';

import { OrdersPage } from '@pages/OrdersPage';
import { StorePage } from '@pages/StorePage';
import { WalletPage } from '@pages/WalletPage';
import { BottomNavBar } from '@widgets/BottomNavBar';

export function App() {
  const location = useLocation();

  return (
    <>
      {/* keyed by path so AnimatePresence can run the exit transition */}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<StorePage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="*" element={<StorePage />} />
        </Routes>
      </AnimatePresence>

      <BottomNavBar />
    </>
  );
}
