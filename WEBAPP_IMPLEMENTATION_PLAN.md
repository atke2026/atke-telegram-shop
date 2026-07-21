# YeneShop Web App - Implementation Plan

This document outlines the architecture, tech stack, and strict UI guidelines for the Telegram Mini App (Frontend) phase of the YeneShop digital reselling bot.

## 1. Technical Stack & Choices
> [!NOTE]
> Based on our architectural discussions, the frontend will be built to enterprise-grade standards using the following stack:
> - **Framework:** React 18 built with Vite (for lightning-fast compilation and a tiny bundle size).
> - **State Management:** Redux Toolkit (RTK) paired with RTK Query for automated API fetching, caching, and state synchronization.
> - **Styling:** Vanilla CSS (CSS Modules) to strictly map native Telegram CSS variables and ensure zero style bleeding.
> - **Iconography:** Phosphor Icons (for a crisp, modern, multi-weight aesthetic).

## 2. Frontend Architecture: Feature-Sliced Design (FSD)
To ensure the app remains highly scalable and maintainable, we are utilizing **Feature-Sliced Design**. The `src/` directory is strictly divided by business scope rather than technical type:

```text
src/
├── app/               # Global setup, routing, and the main Redux store configuration
├── pages/             # Route-level components (StorePage, WalletPage, OrdersPage)
├── widgets/           # Complex UI blocks used across pages (BottomNavBar, ProductGrid)
├── features/          # User interactions (BuyProductFeature, UploadScreenshotFeature)
├── entities/          # Core business domains (User, Product) including RTK Query slices
└── shared/            # Reusable UI components, Phosphor icons, and Telegram SDK hooks
```

### Isolated Component Folders
Every component in the application, regardless of its layer, will follow a strict, isolated folder structure:
```text
ComponentName/
├── index.ts               # Clean export `export { ComponentName } from './ComponentName'`
├── ComponentName.tsx      # The React logic and markup
└── ComponentName.module.css # Isolated CSS styles
```

## 3. UI & Design System (Native Telegram Aesthetic)
The Web App must feel like an organic extension of the native Telegram mobile app.

### Dynamic Theming
No hardcoded hex colors will be used for primary elements. We will bind our CSS exclusively to the Telegram Web App SDK variables so the app flawlessly adapts to the user's Dark/Light/Custom themes:
- Backgrounds: `var(--tg-theme-bg-color)`
- Text: `var(--tg-theme-text-color)`
- Primary Buttons: `var(--tg-theme-button-color)`

### Component Styling Rules
- **Icons:** We will use the **Phosphor Icons** library. The `Light` or `Regular` weights will be prioritized to maintain a crisp, sophisticated iOS-like feel.
- **Cards & Modals:** 
  - Borders: Microscopic `0.5px solid rgba(0,0,0,0.1)` (adjusted for dark mode).
  - Shadows: Tight, non-diffused downward drops (`box-shadow: 0 2px 4px rgba(0,0,0,0.05)`).
  - Corners: `border-radius: 12px` to `14px`.
- **Buttons:** 
  - Shape: Pill-shaped or heavily rounded (`border-radius: 10px` to `14px`).

### Tactile Interactions
The UI must feel physically responsive:
- **Click Effects:** All buttons and interactive cards must scale down slightly when pressed: `.button:active { transform: scale(0.97); }`.
- **Haptic Feedback:** The Telegram SDK will be utilized to trigger physical device vibrations on key actions (e.g., successful purchases, errors, or depositing ETB).

## 4. State Management (Redux & RTK Query)
- **User Session:** The Telegram `initData` will be validated upon app load. The Redux `userSlice` will hold the validated user state, including their current `balanceETB`.
- **Product Caching:** RTK Query will fetch the `/api/products` endpoint. The products will be cached in the Redux store instantly so navigating between the Store and Wallet pages feels instantaneous, with background re-fetching to ensure stock levels are accurate.

## 5. Main Screens (Pages)
1. **Store Page:** A grid/list of digital products fetched from RTK Query. Includes a search/filter bar.
2. **Wallet Page:** Displays the user's ETB balance and an interactive `UploadScreenshotFeature` widget to request manual deposits from the admin.
3. **Orders Page:** A history list of purchased items, allowing the user to view their digital license keys or account credentials securely.
