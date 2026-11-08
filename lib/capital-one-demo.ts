import type { Account } from "./finance";

// Stand-in for the user's Capital One accounts until the back end pulls them from Nessie.
// Replace this list with the Nessie response (GET /customers/{id}/accounts) once it's wired up.
export const CAPITAL_ONE_DEMO_ACCOUNTS: Account[] = [
  { id: "COF-CHECKING", bank: "Capital One", type: "checking", name: "Checking", mask: "7784", balance: 2140.55, kind: "cash", monthlyPayment: 0, apr: 0, yieldPct: 0 },
  { id: "COF-SAVINGS", bank: "Capital One", type: "savings", name: "Savings", mask: "3310", balance: 4800.0, kind: "cash", monthlyPayment: 0, apr: 0, yieldPct: 4.0 },
  { id: "COF-CARD", bank: "Capital One", type: "credit_card", name: "Credit card", mask: "1544", balance: 1236.4, kind: "credit", monthlyPayment: 40, apr: 24.9, yieldPct: 0 },
];
