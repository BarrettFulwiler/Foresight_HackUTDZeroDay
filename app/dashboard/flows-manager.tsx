"use client";
import { FormEvent, useEffect, useState } from "react";
import { type Audience, EXPENSE_CATEGORIES, type FlowErrors, type FlowKind, validateFlow } from "../../lib/account-products";
import { categoryMeta, money } from "../../lib/format";
import styles from "./accounts-manager.module.css";

// Monthly income sources or expenses (kind), added as many as the person has. Each is saved in Nessie as a
// recurring bill on its account, and the dashboard's spending pie, history and forecasts are built from them.
type Flow = { id: string; kind: FlowKind; name: string; amount: number; accountId: string; day: number; category: string };
type Acct = { id: string; name: string; kind: string; label: string; mask: string };
type Draft = { id?: string; name: string; amount: string; accountId: string; day: string; category: string };

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;

export default function FlowsManager({ kind, audience, embedded, onChanged }: { kind: FlowKind; audience: Audience; embedded?: boolean; onChanged?: () => void }) {
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<FlowErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saved, setSaved] = useState("");

  const income = kind === "income";
  const usable = accounts.filter((a) => (income ? a.kind === "cash" || a.kind === "investment" : a.kind !== "loan"));
  const cats = EXPENSE_CATEGORIES[audience];
  const mine = (flows ?? []).filter((f) => f.kind === kind);
  const total = mine.reduce((s, f) => s + f.amount, 0);

  async function load() {
    try {
      const r = await fetch("/api/flows", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Couldn't load.");
      setFlows(body.flows);
      setAccounts(body.accounts);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  function start(f?: Flow) {
    setDraft(f ? { id: f.id, name: f.name, amount: String(f.amount), accountId: f.accountId, day: String(f.day), category: f.category } : { name: "", amount: "", accountId: usable[0]?.id ?? "", day: "1", category: "" });
    setErrors({});
    setFormError("");
    setSaved("");
  }

  async function changed(message: string) {
    setDraft(null);
    setConfirming(null);
    setSaved(message);
    await load();
    onChanged?.();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const local = validateFlow(kind, audience, draft, usable);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(draft.id ? `/api/flows/${draft.id}` : "/api/flows", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...draft, day: Number(draft.day) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(body.errors ?? {});
        setFormError(body.errors ? "" : body.error || "Couldn't save. Try again.");
        return;
      }
      await changed(draft.id ? `Saved ${draft.name.trim()}.` : `Added ${draft.name.trim()}. Add another, or move on when you're done.`);
    } catch {
      setFormError("Couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/flows/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setLoadError((await res.json().catch(() => ({}))).error || "Couldn't remove it.");
      return;
    }
    await changed("Removed.");
  }

  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `PNC ${a.name}${a.mask ? ` ••${a.mask}` : ""}` : "an account";
  };
  const set = (k: keyof Draft, v: string) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  return (
    <section className={embedded ? styles.embedded : styles.wrap} aria-label={income ? "Income" : "Expenses"}>
      <div className={styles.head}>
        {!embedded && (
          <div>
            <h2 className={styles.title}>{income ? (audience === "company" ? "Revenue" : "Income") : "Monthly expenses"}</h2>
            <p className={styles.sub}>
              {income ? "Every source of money coming in each month." : "Every bill and regular cost each month."} Your spending charts and forecast are built from these.
            </p>
          </div>
        )}
        {!draft && usable.length > 0 && (
          <button type="button" className={styles.addBtn} onClick={() => start()}>
            + Add {mine.length ? "another" : income ? "an income source" : "an expense"}
          </button>
        )}
      </div>

      {flows && usable.length === 0 && (
        <p className={styles.notice}>Add {income ? "a bank account" : "a bank account or credit card"} first, so there&rsquo;s somewhere for this money to {income ? "land" : "come from"}.</p>
      )}
      {saved && !draft && <p className={styles.saved} role="status">{saved}</p>}
      {loadError && <p className={styles.error} role="alert">{loadError}</p>}

      {draft && (
        <form className={styles.form} onSubmit={save} noValidate aria-label={income ? "Income source" : "Expense"}>
          <h3 className={styles.formTitle}>{draft.id ? `Edit ${draft.name || ""}` : income ? "Add an income source" : "Add an expense"}</h3>
          <div className={styles.grid}>
            {!income && (
              <label className={styles.field}>Category
                <select value={draft.category} onChange={(e) => set("category", e.target.value)} aria-invalid={Boolean(errors.category)}>
                  <option value="" disabled>Choose one</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {errors.category && <small className={styles.fieldError}>{errors.category}</small>}
              </label>
            )}
            <label className={styles.field}>{income ? "Source" : "Name"}
              <input value={draft.name} maxLength={60} placeholder={income ? (audience === "company" ? "Customer payments" : "Paycheck") : "Rent"} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name)} />
              {errors.name && <small className={styles.fieldError}>{errors.name}</small>}
            </label>
            <label className={styles.field}>Amount each month
              <span className={`${styles.inputWrap} ${styles.dollar}`}>
                <input inputMode="decimal" value={draft.amount} placeholder="0.00" onChange={(e) => set("amount", e.target.value)} aria-invalid={Boolean(errors.amount)} />
              </span>
              {errors.amount && <small className={styles.fieldError}>{errors.amount}</small>}
            </label>
            <label className={styles.field}>{income ? "Paid into" : "Paid from"}
              <select value={draft.accountId} onChange={(e) => set("accountId", e.target.value)} aria-invalid={Boolean(errors.accountId)}>
                {usable.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.label})</option>)}
              </select>
              {errors.accountId && <small className={styles.fieldError}>{errors.accountId}</small>}
            </label>
            <label className={styles.field}>Day of the month
              <select value={draft.day} onChange={(e) => set("day", e.target.value)} aria-invalid={Boolean(errors.day)}>
                {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
              {errors.day && <small className={styles.fieldError}>{errors.day}</small>}
            </label>
          </div>
          {formError && <p className={styles.error} role="alert">{formError}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add"}</button>
          </div>
        </form>
      )}

      {flows === null && !loadError && <p className={styles.sub}>Loading…</p>}
      {flows && mine.length === 0 && !draft && usable.length > 0 && (
        <p className={styles.empty}>{income ? "No income added yet." : "No expenses added yet."}</p>
      )}
      {mine.length > 0 && (
        <div className={styles.group}>
          <h3 className={styles.groupTitle}>{money(total)} a month in total</h3>
          <ul className={styles.list}>
            {mine.map((f) => (
              <li key={f.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <strong>{f.name}</strong>
                  <span>{income ? "" : `${categoryMeta(f.category).label} · `}{income ? "Into" : "From"} {accountName(f.accountId)} · on the {ordinal(f.day)}</span>
                  <span className={styles.rowValues}>{money(f.amount)} a month</span>
                </div>
                {confirming === f.id ? (
                  <div className={styles.confirm} role="alert">
                    <span>Remove {f.name}?</span>
                    <button type="button" className={styles.dangerBtn} onClick={() => remove(f.id)}>Remove</button>
                    <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)}>Keep it</button>
                  </div>
                ) : (
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.linkBtn} onClick={() => start(f)} disabled={Boolean(draft)}>Edit</button>
                    <button type="button" className={styles.linkBtnDanger} onClick={() => setConfirming(f.id)} disabled={Boolean(draft)}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
