// Formatting helpers that are safe to use in client components.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const money = (n: number, cents = true) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export const shortMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} '${ym.slice(2, 4)}`;
export const longMonth = (ym: string) => `${LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

type Meta = { label: string; color: string; about: string };
export const CATEGORY_META: Record<string, Meta> = {
  housing: { label: "Housing", color: "#E5534B", about: "Home costs paid from checking. Your mortgage itself is tracked separately under Loans." },
  utilities: { label: "Utilities", color: "#F2C230", about: "Monthly bills like electricity, water, internet and phone." },
  groceries: { label: "Groceries", color: "#3D6FB6", about: "Food and household essentials, bought by card or with cash from checking." },
  dining: { label: "Dining", color: "#8BC34A", about: "Restaurants, takeout and coffee." },
  transport: { label: "Transport", color: "#E0457B", about: "Gas, rideshares, parking and transit." },
  shopping: { label: "Shopping", color: "#26A69A", about: "Clothes, electronics and other store purchases." },
  other_spending: { label: "Other", color: "#4FB6E8", about: "Spending that doesn't fit another category." },
  // Business categories (company dashboard; vendors grouped in lib/company-dashboard.ts).
  payroll: { label: "Payroll", color: "#E5534B", about: "Payroll runs from the payroll account." },
  supplies: { label: "Supplies", color: "#3D6FB6", about: "Office supplies, wholesale goods and inventory." },
  software: { label: "Software & telecom", color: "#4FB6E8", about: "Cloud hosting, software and phone service." },
  fuel_equipment: { label: "Fuel & equipment", color: "#F2C230", about: "Fuel and equipment rental." },
  professional: { label: "Professional services", color: "#26A69A", about: "Legal, tax, insurance and payroll services." },
  marketing: { label: "Marketing", color: "#E0457B", about: "Advertising and marketing agencies." },
  facilities: { label: "Facilities & utilities", color: "#8BC34A", about: "Building services and utilities." },
  shipping_travel: { label: "Shipping & travel", color: "#F59E42", about: "Freight brokers and business travel." },
};
const FALLBACK = ["#F59E42", "#8D6E63", "#3D6B4F", "#1F4E79"];
export function categoryMeta(key: string, i = 0): Meta {
  return (
    CATEGORY_META[key] ?? {
      label: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      color: FALLBACK[i % FALLBACK.length],
      about: "Spending in this category.",
    }
  );
}

export const KIND_LABEL: Record<string, string> = { payment: "Bill payment", purchase: "Card purchase", withdrawal: "Cash withdrawal", payroll: "Payroll run" };
export const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
