import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import { App } from '@app/App';
import { store } from '@app/store';
import { initTelegram } from '@shared/lib/telegram';
import './app/styles/global.css';

// Must run before React paints so the theme attribute is already set.
initTelegram();

const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter basename={routerBase}>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
