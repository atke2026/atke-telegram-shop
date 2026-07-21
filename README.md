# YeneShop

Telegram bot for reselling digital products through the HubX Reseller API, priced in
Ethiopian Birr with a manual (screenshot-verified) deposit flow.

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the design rationale.

## Setup

```bash
npm install
cp .env.example .env      # fill in BOT_TOKEN, HUBX_API_KEY, ADMIN_TELEGRAM_IDS
npm run prisma:migrate    # creates the schema
npm run dev
```

### Postgres role

If you don't have a database role yet:

```sql
CREATE ROLE yeneshop LOGIN PASSWORD 'yeneshop';
CREATE DATABASE yeneshop OWNER yeneshop;
```

## Commands

| Command | Who | Purpose |
| --- | --- | --- |
| `/start` | anyone | Register and show the main menu |
| `/products` | user | Browse the catalogue |
| `/balance` | user | Wallet balance |
| `/deposit` | user | Amount → receipt screenshot → admin review |
| `/orders` | user | Last 10 orders |
| `/pending` | admin | Deposits awaiting review |
| `/setrate <n>` | admin | Set the USDT→ETB rate and reprice |
| `/setinstructions <text>` | admin | Payment instructions shown on `/deposit` |
| `/sync` | admin | Force a catalogue sync |
| `/credit <tgId> <amt>` | admin | Manual balance adjustment (negative to debit) |
| `/stats` | admin | Store + HubX status |

## Architecture

```
src/core          entities, errors, ports        — no external dependencies
src/use-cases     business logic                 — depends only on core
src/infrastructure Prisma, Redis, HubX client    — implements the ports
src/interfaces    Telegram bot, scheduler        — entry points
src/shared        config, logger, DI container
```

Dependencies point inward only. `use-cases` never imports from `infrastructure` or
`interfaces`, which is what keeps the planned Web App a matter of adding one adapter.

### Money

Balances are integer minor units (`Money`, backed by `bigint`) in the domain and
`DECIMAL(18,2)` in Postgres. No floats anywhere on the money path.

### Safety properties

- **No overdraft.** `adjustBalance` is a conditional `UPDATE ... WHERE balance >= amount`,
  so two concurrent purchases cannot both pass the check.
- **No double credit.** Deposit approval claims the row (`WHERE status = 'PENDING'`) and
  credits the wallet in one transaction, so a double-tap on Approve is a no-op.
- **Idempotent upstream orders.** Our order UUID is sent as HubX's `external_order_id`.
- **Refund on failure.** Any error after the debit refunds the wallet; if the refund
  itself fails, the admins get a 🚨 alert naming the user and amount.

## Testing

```bash
npm test
```

## Before going live

The HubX request/response shapes in `src/infrastructure/hubx/HubxClient.ts` were written
against the plan, not the live API. Verify the endpoint paths, the auth header, and the
JSON field names against the real HubX documentation before taking real payments.
