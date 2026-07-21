# YeneShop Web App

Telegram Mini App frontend. See [../WEBAPP_IMPLEMENTATION_PLAN.md](../WEBAPP_IMPLEMENTATION_PLAN.md).

## Running

The API must be up first — the dev server proxies `/api` and `/logos` to it:

```bash
cd ../server && npm run dev     # terminal 1
cd webapp && npm run dev        # terminal 2 → http://localhost:5173
```

> If `npm run dev` dies with `ENOSPC: System limit for number of file watchers`,
> raise the inotify limit (needs sudo):
> ```bash
> sudo sysctl fs.inotify.max_user_watches=524288
> ```
> Until then, `npm run build && npm run preview` works — it doesn't watch files.

### Opening it outside Telegram

Every request is authenticated with Telegram `initData`, which a plain browser
tab doesn't have, so the app would show only errors. For development, generate a
signed string and store it:

```bash
cd ../server && npx tsx scripts/dev-init-data.ts
```

Paste the printed snippet into the browser console. The fallback only exists in
dev builds, and the server verifies the HMAC regardless — it cannot be used to
forge a session.

## Architecture (Feature-Sliced Design)

```
src/
├── app/        store, routing, global styles and theme
├── pages/      StorePage, WalletPage, OrdersPage
├── widgets/    BottomNavBar, ProductGrid
├── features/   buy-product, request-deposit
├── entities/   user, product, order, deposit (RTK Query slices)
└── shared/     UI kit, Telegram SDK wrapper, base API
```

Imports only ever point downward, via the `@app` / `@pages` / `@widgets` /
`@features` / `@entities` / `@shared` aliases. Every component is an isolated
folder of `index.ts` + `Component.tsx` + `Component.module.css`.

## Design system

All colours resolve to Telegram theme variables (`--tg-theme-*`) with a fallback
for browser use, so the app follows the user's light/dark/custom theme. The
hairline border and card shadow invert on dark, where `rgba(0,0,0,0.1)` would be
invisible.

Tactile behaviour lives in the primitives rather than at call sites: `Button` and
`Card` both scale to 0.97 on press with spring physics and fire a light haptic,
so every interaction is consistent by construction. Page transitions are owned by
`Screen`.

## Fonts

`npm run fonts:build` converts the SchriftedSans TTFs at the repo root to woff2.
Only the four upright text weights ship (400/500/600/700) — 250KB instead of the
~3MB all 16 faces would cost on a mobile connection. Italics are unused by the UI;
add them to `scripts/build-fonts.mjs` if that changes.
