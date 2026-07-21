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
Telegram handles primary authentication seamlessly. Users are **not** required to share their phone numbers, ensuring a completely frictionless 1-click onboarding experience.

- **Step 1:** User clicks `/start`. The bot instantly records their `telegramId`, `firstName`, and `username` in the background.
- **Step 2:** The user is instantly authenticated and unlocked to browse products and place orders.
- **Web App:** The Web App uses the `initData` hash for secure validation of the exact same user identity.

## 3. Database Schema Updates
The Prisma `User` schema is updated to accommodate the frictionless onboarding requirements:
```prisma
model User {
  id          String   @id @default(uuid())
  telegramId  String   @unique
  firstName   String?
  username    String?
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
