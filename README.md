# Foresight_HackUTDZeroDay

**Foresight — Banking your way.** Every account at every bank in one picture, and a future-you who shows where your money is headed. Built at HackUTD Zero Day 2026 for the PNC (360° Financial Health Navigator) and Capital One (Best Use of Nessie) challenges.

## What's here

| Page | What it does |
|---|---|
| `/` | Landing page |
| `/start` | Create account / sign in, plus **Try the demo** |
| `/onboarding` | 5-step setup: who it's for, location, how you see your money (with a live preview), goals, consent |
| `/dashboard` | **View**: cash headline (dollars or days), goal card, spending donut (click a slice for details), savings chart, budgeting, account cards. **Move**, **Edit**, **Advising** tabs |

Onboarding choices change the dashboard: simple or detailed layout, cash in dollars or "days it lasts", and a 1- or 3-month spending view.

## Run it

Requires Node 24 (see `.nvmrc`).

```bash
corepack pnpm install
corepack pnpm dev
```

Then open http://127.0.0.1:3000. Other scripts: `corepack pnpm build`, `corepack pnpm typecheck`.

## Code map

- `app/` — pages. Each page has its own CSS module; `globals.css` is only a reset.
- `lib/finance.ts` — reads the CSVs in `data/` (server only) for the demo customer **C005**.
- `lib/capital-one-demo.ts` — **placeholder** Capital One accounts until Nessie is connected.
- `lib/prefs.ts` — onboarding choices, saved in the browser for now.
- `lib/summary.ts`, `lib/format.ts`, `lib/brand.ts` — shared numbers, formatting, and the product name.

## Status

- Sign-in is not connected to a back end yet; the demo user is hardcoded to customer C005.
- Capital One accounts are placeholders; the Move tab's transfer turns on once Nessie is wired up.
- The Advising tab is a placeholder for the plan view.

## Data

`data/` is the synthetic dataset from PNC's HackUTD workshop kit ([devfulcrum/pnc-utd-hackathon-2026](https://github.com/devfulcrum/pnc-utd-hackathon-2026)), licensed under Apache 2.0 (see `data/LICENSE`). No real customer data is used. Nothing in this app is financial advice.
