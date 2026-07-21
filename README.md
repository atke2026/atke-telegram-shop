# YeneShop

Telegram bot for reselling digital products through the HubX Reseller API, priced in
Ethiopian Birr with a manual (screenshot-verified) deposit flow.

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the design rationale.

## Layout

```
yeneshop/
├── server/          Telegram bot + business logic (this is the app)
├── assets/logos/    Product logos, shared with the future web app
├── product_logos/   Raw logo sources
└── *.md             Plans and design notes
```

The web app will live beside `server/` as its own package.

## Setup

All commands run from `server/`:

```bash
cd server
npm install
cp .env.example .env      # fill in BOT_TOKEN, HUBX_API_KEY, ADMIN_TELEGRAM_IDS
npm run prisma:migrate    # creates the schema
npm run dev
```

### Database

Development uses a **user-space Postgres cluster on port 5433**, owned by your login
account — no sudo, and completely separate from any system Postgres on 5432.

```bash
npm run db:start     # start it (data: ~/.local/share/yeneshop/pgdata)
npm run db:status
npm run db:stop
```

It does not survive a reboot; run `db:start` again. To recreate from scratch:

```bash
/usr/lib/postgresql/18/bin/initdb -D ~/.local/share/yeneshop/pgdata -U yeneshop \
  --pwfile=<(echo yeneshop) -A scram-sha-256
```

To use a system Postgres instead, point `DATABASE_URL` at it — nothing in the code
depends on the port or the role name.

### Diagnostics

```bash
npm run check:config       # validates .env without printing secrets
npm run check:hubx         # read-only: balance + catalogue + ETB pricing
npm run sync:once          # one full sync HubX → Postgres → Redis
npm run check:concurrency  # asserts the no-overdraft / no-double-credit invariants
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

## Product logos

`product_logos/` (repo root) holds the raw brand marks as supplied.
`npm run logos:build` normalises them into `assets/logos/` — one 512×512 white-backed WebP per product,
**named by product slug**, so the web app can resolve an image without a lookup
table:

```ts
const src = `/logos/${product.slug}.webp`;
```

Both Lovable products share one brand mark, so the file is emitted twice under
each slug — keeping the naming rule uniform is worth 5KB.

Re-run the script after adding a logo; it reports any source file it did not use.

## Testing

```bash
npm test
```

## HubX integration

Base URL includes the version prefix: `…/api/public/reseller/v1`. Auth is
`Authorization: Bearer rsk_live_…`.

Status mapping (`src/infrastructure/hubx/HubxClient.ts`):

| Status | Meaning | Mapped to | Customer sees |
| --- | --- | --- | --- |
| 401 | invalid/revoked key | `InvalidApiKeyError` | "store offline" + admin alert |
| 402 | our reseller wallet is empty | `SystemOfflineError` | "store offline" + admin alert |
| 404 | product/order missing | `ProductNotFoundError` / `null` | "no longer available" |
| 409 | out of stock (HubX auto-refunds us) | `OutOfStockError` | "out of stock", wallet refunded |

**Still unverified:** the success-response envelope. A 401 probe returns
`{"ok":false,"error":"…"}`, so responses are wrapped, but the payload key on success is
undocumented. `unwrapList` accepts `data`/`products`/`items`/`results` and a bare array.
Run `/sync` with a real key as the first live check — if it reports 0 products while the
dashboard shows some, that unwrapper is the thing to fix.
