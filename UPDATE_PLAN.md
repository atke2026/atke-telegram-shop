# YeneShop Bot - Update Plan (Architecture, Auth, & UI)

This document serves as an update/addendum to the original Implementation Plan, outlining the newly agreed-upon architectural standards, seamless authentication flow, and future Web App design constraints.

## 1. Architectural Upgrade: Clean Architecture
We are upgrading the core structure from a standard Service-Oriented approach to a strict **Clean Architecture (Domain-Driven Design)**.

- **Why:** This ensures the Telegram Bot and the future Web App can share the exact same underlying business logic without code duplication.
- **Structure:**
  - `core/`: Entities and Domain Errors (e.g., `OutOfStockError`).
  - `use-cases/`: Application logic (e.g., `PlaceOrderUseCase`).
  - `infrastructure/`: Prisma DB, Redis Cache, HubX API Client.
  - `interfaces/`: Telegram Bot adapters, Web App REST API adapters.

## 2. Authentication & Onboarding Flow
Telegram handles primary authentication seamlessly via the `telegramId` (for the bot) and `initData` hash (for the Web App). However, because we require the user's phone number, the onboarding process is explicitly defined:

- **Step 1:** User clicks `/start`. The bot instantly records their `telegramId`, `firstName`, and `username` in the background.
- **Step 2 (Blocker):** The bot sends a custom keyboard button: `"📲 Share Contact"`. The user *must* tap this to securely share their phone number.
- **Step 3:** The backend saves the `phone` number to the `User` record.
- **Step 4:** The user is now fully authenticated and unlocked to browse products and place orders.

## 3. Database Schema Updates
The Prisma `User` schema is updated to accommodate the new onboarding requirements:
```prisma
model User {
  id          String   @id @default(uuid())
  telegramId  String   @unique
  firstName   String?
  username    String?
  phone       String?  // Captured via Share Contact button
  avatarUrl   String?
  balanceETB  Float    @default(0.0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## 4. Web App UI & Design System Rules
When development begins on the Web App frontend (using React/Vite), it must strictly emulate the native Telegram mobile experience:

- **Dynamic Theming:** All primary colors must bind to Telegram's native CSS variables (`var(--tg-theme-bg-color)`, `var(--tg-theme-button-color)`) so the app dynamically matches the user's chosen theme (Dark/Light/Custom).
- **Component Styling:**
  - **Cards:** Extremely thin borders (`0.5px solid rgba(0,0,0,0.1)`) and tight, non-diffused downward drop shadows (`box-shadow: 0 2px 4px rgba(0,0,0,0.05)`).
  - **Buttons:** Pill-shaped or heavily rounded (`border-radius: 10-14px`).
- **Tactile Interactions:**
  - **Click Effects:** Buttons must physically scale down when pressed (`transform: scale(0.97)`).
  - **Haptic Feedback:** Important actions (like successful purchases or errors) must trigger the device's vibration motor using the Telegram SDK: `Telegram.WebApp.HapticFeedback.impactOccurred('light')`.
