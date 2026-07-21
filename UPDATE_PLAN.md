# YeneShop Bot - Update Plan (Architecture, Auth, & UI)

This document serves as an update/addendum to the original Implementation Plan, outlining the newly agreed-upon architectural standards, seamless authentication flow, and future Web App design constraints.

**Status**

| Section | State |
| --- | --- |
| 1. Clean Architecture | ✅ Done — `core/`, `use-cases/`, `infrastructure/`, `interfaces/` with inward-only dependencies |
| 2. Auth & onboarding | ✅ Done for the bot — `/start` records the profile, no phone requested. Web App `initData` validation not built |
| 3. Schema updates | ✅ Done — `avatarUrl` added; see the deviations noted below |
| 4. Web App UI rules | ⏳ Not started — constraints for when the React/Vite frontend begins |

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
  telegramId  BigInt   @unique
  firstName   String?
  username    String?
  avatarUrl   String?
  balanceETB  Decimal  @default(0) @db.Decimal(18, 2)
  isBanned    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

> **Two deliberate deviations from the original draft of this section.**
>
> **`balanceETB` is `Decimal`, not `Float`.** Floating point cannot represent
> decimal fractions exactly — `0.1 + 0.2 === 0.30000000000000004` — so a wallet
> built on it accumulates drift: balances that disagree with the sum of their
> deposits, refunds that leave santim behind, and an unreliable
> `balance >= price` check. Doubles also carry only ~15 significant digits.
> Balances are `Decimal(18,2)` in Postgres and integer minor units (`bigint`)
> in the domain, which is what makes the no-overdraft guarantee hold.
> **Do not change this to `Float`.**
>
> **`telegramId` is `BigInt`, not `String`.** Telegram ids are integers that now
> exceed 2^32; `BigInt` stores them exactly and sorts correctly. Note that they
> must be converted to a string before JSON serialization — `JSON.stringify`
> throws on a `BigInt` — which the future Web App API will need to handle.

`avatarUrl` holds the Telegram **`file_id`** of the profile photo, not an HTTP
URL: turning one into a link requires embedding the bot token, which must never
be persisted. Consumers resolve it through `getFile` at display time. It is
populated on `/start` and a failed lookup is ignored rather than allowed to
interrupt onboarding.

## 4. Web App UI & Design System Rules
When development begins on the Web App frontend (using React/Vite), it must strictly emulate the native Telegram mobile experience:

- **Dynamic Theming:** All primary colors must bind to Telegram's native CSS variables (`var(--tg-theme-bg-color)`, `var(--tg-theme-button-color)`) so the app dynamically matches the user's chosen theme (Dark/Light/Custom).
- **Component Styling:**
  - **Cards:** Extremely thin borders (`0.5px solid rgba(0,0,0,0.1)`) and tight, non-diffused downward drop shadows (`box-shadow: 0 2px 4px rgba(0,0,0,0.05)`).
  - **Buttons:** Pill-shaped or heavily rounded (`border-radius: 10-14px`).
- **Tactile Interactions:**
  - **Click Effects:** Buttons must physically scale down when pressed (`transform: scale(0.97)`).
  - **Haptic Feedback:** Important actions (like successful purchases or errors) must trigger the device's vibration motor using the Telegram SDK: `Telegram.WebApp.HapticFeedback.impactOccurred('light')`.
