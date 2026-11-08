"use client";
import { FormEvent, useEffect, useState } from "react";
import { type Audience, type Errors, type FieldKey, type ProductId, type Values, fieldLabel, isMoney, product, productsFor, validate } from "../../lib/account-products";
import { money } from "../../lib/format";
import styles from "./accounts-manager.module.css";

// The Accounts tab: the member's own accounts in Nessie (all shown under PNC). Add as many as they have, edit
// amounts and terms, or remove one. Every amount is checked here and again on the server (lib/account-products.ts).
type Item = { id: string; product: ProductId; name: string; values: Values; mask: string };
type Draft = { id?: string; product: ProductId | ""; name: string; raw: Partial<Record<FieldKey, string>> };

const GROUPS: { title: string; kinds: string[] }[] = [
  { title: "Bank accounts", kinds: ["cash", "investment"] },
  { title: "Credit cards", kinds: ["credit"] },
  { title: "Loans and lines of credit", kinds: ["loan"] },
];

// embedded: shown inside onboarding (no card of its own, no heading). onChanged runs after each save or removal;
// the list itself refreshes in place, so the person can keep adding accounts without being sent anywhere.
export default function AccountsManager({ audience, missing, onChanged, embedded }: { audience: Audience; missing?: string; onChanged?: () => void; embedded?: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [saved, setSaved] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/accounts", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Couldn't load your accounts.");
      setItems(body.accounts);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your accounts.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function changed(message: string) {
    setDraft(null);
    setConfirming(null);
    setSaved(message);
    await load();
    onChanged?.();
  }

  const options = productsFor(audience);
  const p = draft?.product ? product(draft.product) : undefined;

  function startAdd() {
    setDraft({ product: "", name: "", raw: {} });
    setErrors({});
    setFormError("");
  }
  function startEdit(it: Item) {
    const raw: Partial<Record<FieldKey, string>> = {};
    for (const [k, v] of Object.entries(it.values)) raw[k as FieldKey] = v === undefined ? "" : String(v);
    setDraft({ id: it.id, product: it.product, name: it.name, raw });
    setErrors({});
    setFormError("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const local = validate(p, draft.name, draft.raw);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(draft.id ? `/api/accounts/${draft.id}` : "/api/accounts", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: draft.product, name: draft.name, values: draft.raw }),
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
    setRemoving(true);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error || "Couldn't remove it. Try again.");
        return;
      }
      await changed("Removed.");
    } finally {
      setRemoving(false);
    }
  }

  const summary = (it: Item) => {
    const pr = product(it.product);
    if (!pr) return "";
    return pr.fields
      .filter((f) => !(pr.optional?.includes(f) && !it.values[f]))
      .map((f) => `${fieldLabel(pr, f).replace(/ \(.*\)$/, "")} ${isMoney(f) ? money(it.values[f] ?? 0) : `${it.values[f] ?? 0}%`}`)
      .join(" · ");
  };

  return (
    <section className={embedded ? styles.embedded : styles.wrap} aria-label={audience === "company" ? "The company's accounts" : "Your accounts"}>
      <div className={styles.head}>
        {!embedded && (
          <div>
            <h2 className={styles.title}>{audience === "company" ? "The company's accounts" : "Your accounts"}</h2>
            <p className={styles.sub}>Add every account you have at PNC, with what&rsquo;s in it or what&rsquo;s owed. Foresight keeps them in Nessie and builds your forecast from them.</p>
          </div>
        )}
        {!draft && <button type="button" className={styles.addBtn} onClick={startAdd}>+ Add {items?.length ? "another" : "an"} account</button>}
      </div>
      {saved && !draft && <p className={styles.saved} role="status">{saved}</p>}

      {missing && <p className={styles.notice} role="status">Add {missing} to unlock your forecast, plans and what-ifs.</p>}
      {loadError && <p className={styles.error} role="alert">{loadError}</p>}

      {draft && (
        <form className={styles.form} onSubmit={save} noValidate aria-label={draft.id ? "Edit account" : "Add an account"}>
          <h3 className={styles.formTitle}>{draft.id ? `Edit ${draft.name || "account"}` : "Add an account"}</h3>
          <label className={styles.field}>Type of account
            <select
              value={draft.product}
              disabled={Boolean(draft.id)}
              onChange={(e) => {
                setDraft({ ...draft, product: e.target.value as ProductId, raw: {} });
                setErrors({});
              }}
              aria-invalid={Boolean(errors.product)}
            >
              <option value="" disabled>Choose one</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {errors.product && <small className={styles.fieldError}>{errors.product}</small>}
          </label>

          {p && (
            <>
              <label className={styles.field}>Name
                <input value={draft.name} maxLength={40} placeholder={p.example} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={Boolean(errors.name)} />
                {errors.name && <small className={styles.fieldError}>{errors.name}</small>}
              </label>
              <div className={styles.grid}>
                {p.fields.map((f) => (
                  <label key={f} className={styles.field}>
                    {fieldLabel(p, f)}{p.optional?.includes(f) ? " · optional" : ""}
                    <span className={`${styles.inputWrap} ${isMoney(f) ? styles.dollar : styles.percent}`}>
                      <input
                        inputMode="decimal"
                        value={draft.raw[f] ?? ""}
                        placeholder={isMoney(f) ? "0.00" : "0"}
                        onChange={(e) => {
                          setDraft({ ...draft, raw: { ...draft.raw, [f]: e.target.value } });
                          if (errors[f]) setErrors({ ...errors, [f]: undefined });
                        }}
                        aria-invalid={Boolean(errors[f])}
                      />
                    </span>
                    {errors[f] && <small className={styles.fieldError}>{errors[f]}</small>}
                  </label>
                ))}
              </div>
            </>
          )}

          {formError && <p className={styles.error} role="alert">{formError}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={!p || saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Add account"}</button>
          </div>
        </form>
      )}

      {items === null && !loadError && <p className={styles.sub}>Loading your accounts from Nessie…</p>}
      {items && items.length === 0 && !draft && <p className={styles.empty}>No accounts yet. Add your first one to get started.</p>}

      {items && GROUPS.map((g) => {
        const rows = items.filter((it) => g.kinds.includes(product(it.product)?.kind ?? ""));
        if (!rows.length) return null;
        return (
          <div key={g.title} className={styles.group}>
            <h3 className={styles.groupTitle}>{g.title}</h3>
            <ul className={styles.list}>
              {rows.map((it) => (
                <li key={it.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <strong>{it.name}</strong>
                    <span>PNC {product(it.product)?.label}{it.mask ? ` ••${it.mask}` : ""}</span>
                    <span className={styles.rowValues}>{summary(it)}</span>
                  </div>
                  {confirming === it.id ? (
                    <div className={styles.confirm} role="alert">
                      <span>Remove {it.name}? It&rsquo;s deleted from Nessie.</span>
                      <button type="button" className={styles.dangerBtn} onClick={() => remove(it.id)} disabled={removing}>{removing ? "Removing…" : "Remove"}</button>
                      <button type="button" className={styles.cancelBtn} onClick={() => setConfirming(null)} disabled={removing}>Keep it</button>
                    </div>
                  ) : (
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.linkBtn} onClick={() => startEdit(it)} disabled={Boolean(draft)}>Edit</button>
                      <button type="button" className={styles.linkBtnDanger} onClick={() => setConfirming(it.id)} disabled={Boolean(draft)}>Remove</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
