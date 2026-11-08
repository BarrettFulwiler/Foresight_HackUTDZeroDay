# Foresight_HackUTDZeroDay

**Foresight — Banking your way.** Every account at every bank in one picture, and a future-you who shows where your money is headed. Built at HackUTD Zero Day 2026 for the PNC (360° Financial Health Navigator) and Capital One (Best Use of Nessie) challenges.

## What's here

| Page | What it does |
|---|---|
| `/` | Landing page |
| `/start` | Create account / sign in, plus **Try the demo** |
| `/onboarding` | 5-step setup: who it's for, location, how you see your money (with a live preview), goals, consent |
| `/dashboard` | **View**: cash headline (dollars or days), goal card, spending donut (click a slice for details), account history chart, health cards, budgeting, account cards. **Move**, **Edit**, **Advising** tabs |

Onboarding choices change the dashboard: simple or detailed layout, cash in dollars or "days it lasts", and a 1- or 3-month spending view.

## Run it

Requires Node 24 (see `.nvmrc`).

```bash
corepack pnpm install
corepack pnpm dev
```

Then open http://127.0.0.1:3000. Other scripts: `corepack pnpm build`, `corepack pnpm typecheck`.

### Nessie (live balances and transfers)

Copy `.env.example` to `.env.local` and fill in the team's Nessie key and account IDs (ask a teammate; share them privately, never in git). Without it the app still runs, showing demo balances with transfers turned off.

Transfers go through our own server routes (`app/api/nessie/*`), so the key never reaches the browser. They start as **pending**; Nessie's hosted API completes them on a once-a-minute sweep, and the app polls until they finish.

### Gemini (the note from future-you)

Add `GEMINI_API_KEY` (from Google AI Studio) to `.env.local`. Without it, the rest of the app works and the Explain button shows a setup message.

Gemini never does the math. `lib/explain.ts` turns the plan into a list of calculated facts, and `app/api/explain` asks Gemini (Interactions API, `gemini-3.5-flash` with two fallbacks) to rewrite them as a note from future-you. Before the note is shown, the server checks that every number in it appears in the facts. If one doesn't, Gemini gets one retry, and then the note is refused. Gemini sees only those facts: no names or account numbers.

## Code map

- `app/` — pages. Each page has its own CSS module; `globals.css` is only a reset.
- `lib/finance.ts` — reads the CSVs in `data/` (server only) for the demo customer **C005**.
- `lib/nessie.ts` — server-only Nessie client. `lib/live-accounts.ts` swaps in live balances for the 6 linked accounts (PNC checking, savings and card; Capital One checking, savings and card).
- `lib/capital-one-demo.ts` — fallback Capital One accounts when Nessie isn't reachable.
- `lib/forecast.ts`, `lib/plans.ts` — the 12-month forecast and the what-if plans.
- `lib/explain.ts`, `lib/gemini.ts`, `app/api/explain/` — Gemini's note from future-you and the number check.
- `lib/prefs.ts` — onboarding choices, saved in the browser for now.
- `lib/summary.ts`, `lib/format.ts`, `lib/brand.ts` — shared numbers, formatting, and the product name.

## Status

- Sign-in is not connected to a back end yet; the demo user is hardcoded to customer C005.
- Balances for the 6 linked accounts are live from Nessie, and the Move tab makes real Nessie transfers with receipts. PNC's history and analysis still come from PNC's CSVs.
- `lib/forecast.ts` projects every account 12 months ahead from live balances; the View tab's health indicators and the Advising tab use it.
- Advising: pick a what-if (trip, pay off card, surprise bill) to see "present-you wants / future-you warns", both futures on a chart, and a plan. **Apply plan** sends the plan's transfer through Nessie; top-ups and spending cuts are simulated in the forecast (`lib/plans.ts`). **Explain it with Gemini** writes the plan as a note from future-you, with every number checked against the forecast.

## Data

`data/` is the synthetic dataset from PNC's HackUTD workshop kit ([devfulcrum/pnc-utd-hackathon-2026](https://github.com/devfulcrum/pnc-utd-hackathon-2026)), licensed under Apache 2.0 (see `data/LICENSE`). No real customer data is used. Nothing in this app is financial advice.
