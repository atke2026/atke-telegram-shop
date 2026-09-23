# Suq

Suq is a Telegram storefront backed exclusively by YeneShop's private reseller
API. Suq owns its customer accounts, ETB wallets, deposits, discounts and local
order audit trail; YeneShop owns the supplier catalogue, stock and fulfillment.
Suq never connects to YeneShop's database or HubX.

Telegram bot: `@suqet_bot`.

Production Mini App: `https://yeneshop.amixmon.com/suq/`.

## Telegram entry and authentication

The customer bot is a Mini App launcher, not a second storefront. `/start`
attaches one Web App button labelled **Open Suq.et** to its welcome message;
it does not register users, list products, accept deposits or place orders in
chat. The bot's native menu button opens the same URL.

On first confirmation, Suq shows a bottom sheet with the Telegram account's
avatar, name, username and ID. It remembers that cosmetic confirmation for the
same Telegram user on later launches. The button uses Telegram's own
`--tg-theme-button-color` and `--tg-theme-button-text-color`; regardless of the
remembered UI choice, the server verifies Telegram's signed `initData` on every
protected request before registering or loading the user.
Maintenance is displayed inside the app. Channel membership is optional and is
enabled only when `CHANNEL_MEMBERSHIP_REQUIRED=true`; the configured channel
must exist and the bot must be one of its administrators.

## Supplier boundary

All supplier traffic is server-to-server under `/api/reseller/v1`:

- `GET /products` refreshes Suq's local read cache with reseller cost,
  suggested retail price, stock, image, delivery mode and customer-input rules.
- `GET /balance` protects customers from purchases Suq's reseller wallet cannot
  fund.
- `POST /orders` uses Suq's local order UUID as YeneShop `externalId`, making
  retries idempotent.
- `GET /orders/:externalId` reconciles delayed/manual deliveries and uncertain
  network outcomes. A scheduled job completes or refunds the local order and
  notifies the customer.

The live API key stays only in the server environment. It must never be placed
in Vite variables, browser code, Telegram init data, logs or backups.

## Setup

```bash
cd server
npm install
cp .env.example .env
# Set BOT_TOKEN, ADMIN_TELEGRAM_IDS, DATABASE_URL, Redis and the YeneShop values.
npm run prisma:migrate
npm run check:config
npm run check:yeneshop
npm run dev
```

Required supplier configuration:

```dotenv
YENESHOP_API_URL=https://your-yeneshop-host/api/reseller/v1
YENESHOP_API_KEY=ysk_live_...
```

An administrator must first grant Suq's Telegram account reseller access in
YeneShop, enable the products Suq may sell, set their reseller prices, and then
generate the live key from that account's YeneShop reseller workspace.

## Verification

```bash
cd server
npm run typecheck
npm test
npm run build

cd ../webapp
npm run typecheck
npm run build
```

## Deployment

`./deploy.sh` installs Suq as an independent systemd service on port `8081`
and mounts the built Mini App at `/suq/` inside YeneShop's existing Nginx
virtual host. It keeps separate application files in `/opt/suq` and publishes
the frontend to `/var/www/yeneshop/suq`; it does not replace YeneShop or its
API on port `8080`.

Before the first deployment, provide a real live reseller key in
`server/.env`. The deploy preflight deliberately refuses the placeholder key.
YeneShop must have granted the configured Suq administrator reseller access
and enabled at least one reseller offer.

## Money and order safety

- Every amount remains an integer-minor-unit `Money` value in the domain and a
  decimal string at API boundaries. YeneShop supplier costs are ETB-native.
- Customer debit and local PAID-order creation happen in one transaction.
- YeneShop order creation is retried only with the same local UUID.
- Definite supplier rejection refunds atomically; an unknown network outcome
  stays PAID and is reconciled by `externalId`, avoiding free double delivery.
- YeneShop `MANUAL` orders stay pending in Suq until YeneShop completes them;
  Suq operators do not independently fulfill supplier-owned products.

## Project layout

```text
server/src/core             domain entities and ports
server/src/use-cases        customer, catalogue and order workflows
server/src/infrastructure   Prisma, Redis and the YeneShop reseller client
server/src/interfaces       Telegram bot, scheduler and Suq web API
webapp/src                  Telegram Mini App
```
