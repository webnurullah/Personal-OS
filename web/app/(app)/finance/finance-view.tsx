"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { ArrowDownLeft, ArrowUpRight, Banknote, CreditCard, Landmark, Pencil, PiggyBank, Plus, Receipt, Search, Smartphone, Trash2, Wallet, type LucideIcon } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { addMonths, daysBetween, formatDate, relativeDay } from "@/lib/dates";
import { monthTotals } from "@/lib/finance";
import { pct } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import { useProfile } from "@/lib/profile";
import type { Bill, BudgetCategory, FinanceMonth, PaymentMethod, Transaction } from "@/lib/types";
import { Donut, Progress } from "@/components/ui/charts";
import { ColorPicker, Field, IconPicker, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Icon, MONEY_ICONS } from "@/components/ui/icon";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const METHODS: PaymentMethod[] = ["bKash", "Nagad", "Card", "Cash", "Bank", "Other"];
const METHOD_ICON: Record<PaymentMethod, [LucideIcon, string]> = {
  bKash: [Smartphone, "text-pink-500"],
  Nagad: [Smartphone, "text-orange-500"],
  Card: [CreditCard, "text-blue-500"],
  Cash: [Banknote, "text-emerald-600"],
  Bank: [Landmark, "text-slate-500"],
  Other: [Wallet, "text-slate-400"],
};

type Filter = "all" | "expense" | "income";

export function FinanceView() {
  // A search result can link to ?month=YYYY-MM.
  const [month, setMonth] = useState<string | null>(() => {
    const value = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("month");
    return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
  });
  const { data, error, mutate } = useSWR<FinanceMonth>(month ? `/finance?month=${month}` : "/finance");
  const { money } = useProfile();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [txModal, setTxModal] = useState<Transaction | "new" | null>(null);
  const [catModal, setCatModal] = useState<BudgetCategory | "new" | null>(null);
  const [billModal, setBillModal] = useState<Bill | "new" | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  useNewAction(() => setTxModal("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const thisMonth = data.today.slice(0, 7);
  const totals = monthTotals(data.categories, data.transactions);
  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const months = Array.from({ length: 13 }, (_, i) => addMonths(thisMonth, 1 - i)); // next month … a year ago
  if (!months.includes(data.month)) months.push(data.month);

  const q = query.trim().toLowerCase();
  const shown = data.transactions.filter((tx) => {
    if (filter !== "all" && tx.type !== filter) return false;
    if (!q) return true;
    const category = tx.budget_category_id ? byId.get(tx.budget_category_id)?.name ?? "" : "";
    return `${tx.description} ${tx.note} ${tx.method} ${category}`.toLowerCase().includes(q);
  });

  const deleteBill = async (bill: Bill) => {
    if (!(await confirm({ title: `Delete “${bill.name}”?`, message: `${toArchive(`“${bill.name}”`)} Payments already made stay in your transactions.` }))) return;
    // Gone at once; it comes back if the delete fails.
    setBillModal(null);
    await mutate((current) => current && { ...current, bills: current.bills.filter((b) => b.id !== bill.id) }, { revalidate: false });
    try {
      await api(`/finance/bills/${bill.id}`, { method: "DELETE" });
      toast("Bill moved to the Archive");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/finance");
  };

  return (
    <>
      <PageHeader title="Finance" description="Know where every taka goes.">
        <select className="select select-lg w-auto" value={data.month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {formatDate(`${m}-01`, "month")}
              {m === thisMonth ? " (this month)" : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={() => setTxModal("new")}>
          <Plus className="size-4" />
          Add Transaction
        </button>
      </PageHeader>

      {/* Summary, added up from this month's transactions */}
      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SummaryCard label="Income" icon={ArrowDownLeft} tile="bg-emerald-50 text-emerald-600" value={money(totals.income)} note={data.month === thisMonth ? "this month" : formatDate(`${data.month}-01`, "monthShort")} />
        <SummaryCard label="Spent" icon={ArrowUpRight} tile="bg-rose-50 text-rose-600" value={money(totals.spent)} note="not counting savings" />
        <SummaryCard label="Saved" icon={PiggyBank} tile="bg-blue-50 text-blue-600" value={money(totals.saved)} note={`${pct(totals.saved, totals.income)}% of income`} />
        <SummaryCard
          label="Budget left"
          icon={Wallet}
          tile="bg-amber-50 text-amber-600"
          value={money(totals.left)}
          valueClass={totals.left < 0 ? "text-rose-600" : undefined}
          note={`of ${money(totals.budget)}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Transactions */}
        <section className="card overflow-hidden" aria-labelledby="tx-title">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <h2 id="tx-title" className="card-title">Transactions</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<Filter>
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "expense", label: "Expenses" },
                  { value: "income", label: "Income" },
                ]}
              />
              <label className="relative">
                <span className="sr-only">Search transactions</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input type="search" placeholder="Search" className="input h-9 w-44 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
          </div>
          {shown.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm sm:min-w-[680px]">
                <thead className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Description</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Date</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Category</th>
                    <th className="hidden px-4 py-2.5 sm:table-cell">Paid with</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="hidden w-12 sm:table-cell"><span className="sr-only">Edit</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((tx) => {
                    const income = tx.type === "income";
                    const category = tx.budget_category_id ? byId.get(tx.budget_category_id) : undefined;
                    const [MethodIcon, methodTone] = METHOD_ICON[tx.method] ?? METHOD_ICON.Other;
                    return (
                      <tr key={tx.id} className="group cursor-pointer hover:bg-slate-50/70" onClick={() => setTxModal(tx)}>
                        <td className="px-3 py-3 sm:px-5">
                          <div className="flex items-center gap-3">
                            <span className={`icon-tile size-9 shrink-0 max-sm:hidden ${income ? "bg-emerald-50 text-emerald-700" : category ? colorOf(category.color).badge : "bg-slate-100 text-slate-500"}`}>
                              {income ? <Banknote className="size-4" /> : <Icon name={category?.icon ?? "receipt"} className="size-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800">{tx.description}</p>
                              {tx.note && <p className="text-xs text-slate-500">{tx.note}</p>}
                              <p className="text-xs text-slate-500 sm:hidden">
                                {relativeDay(tx.tx_date, data.today)} · {income ? "Income" : category?.name ?? "No category"} · {tx.method}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 sm:table-cell">{relativeDay(tx.tx_date, data.today)}</td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          <span className={`badge max-w-48 truncate ${income ? "bg-emerald-50 text-emerald-700" : category ? colorOf(category.color).badge : "bg-slate-100 text-slate-500"}`}>
                            {income ? "Income" : category?.name ?? "No category"}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <MethodIcon className={`size-3.5 ${methodTone}`} />
                            {tx.method}
                          </span>
                        </td>
                        <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold sm:px-5 ${income ? "text-emerald-600" : "text-slate-900"}`}>
                          {income ? "+" : "−"}
                          {money(Number(tx.amount))}
                        </td>
                        <td className="hidden pr-3 text-right sm:table-cell">
                          <Pencil className="reveal ml-auto size-4 text-slate-300" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-t border-slate-100 py-12 text-center text-sm text-slate-500">
              {data.transactions.length ? "No transactions match." : `No transactions in ${formatDate(`${data.month}-01`, "month")} yet.`}
            </p>
          )}
        </section>

        {/* Budget + bills */}
        <aside className="space-y-5">
          <section className="card p-5" aria-labelledby="budget-title">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="budget-title" className="card-title">Budget by category</h2>
                <p className="text-xs text-slate-500">Spent this month against the limit you set</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setCatModal("new")} aria-label="Add budget category">
                <Plus className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative size-32 shrink-0">
                <Donut segments={totals.rows.map((row) => ({ value: row.spent, color: colorOf(row.color).hex }))} max={Math.max(totals.budget, totals.outgoing - totals.uncategorized)} className="absolute inset-0" />
                <div className="absolute inset-0 grid place-content-center text-center">
                  <p className="text-lg font-bold text-slate-900">{pct(totals.outgoing, totals.budget)}%</p>
                  <p className="text-[11px] text-slate-500">used</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                <b className="text-slate-900">{money(totals.outgoing)}</b> of {money(totals.budget)} budget used, savings included.
                {totals.uncategorized > 0 && <span className="mt-1 block text-xs text-slate-500">{money(totals.uncategorized)} has no category.</span>}
              </p>
            </div>
            {totals.rows.length ? (
              <ul className="mt-5 space-y-4">
                {totals.rows.map((row) => {
                  const limit = Number(row.monthly_limit);
                  const over = row.spent > limit;
                  return (
                    <li key={row.id}>
                      <button type="button" className="group flex w-full items-center gap-3 text-left" onClick={() => setCatModal(row)} title="Edit category">
                        <span className={`icon-tile size-8 ${colorOf(row.color).badge}`}>
                          <Icon name={row.icon} className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 font-medium text-slate-800 group-hover:text-blue-700">{row.name}</span>
                            <span className={`shrink-0 whitespace-nowrap text-xs ${over ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                              {money(row.spent)} / {money(limit)}
                            </span>
                          </div>
                          <Progress value={pct(row.spent, limit)} fill={over ? "bg-rose-500" : colorOf(row.color).bar} className="mt-1.5 h-2" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-slate-500">No categories yet. Add one with the + button.</p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="bills-title">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 id="bills-title" className="card-title">Upcoming bills</h2>
                <p className="text-xs text-slate-500">“Pay” adds the bill to your transactions</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setBillModal("new")} aria-label="Add bill">
                <Plus className="size-4" />
              </button>
            </div>
            {data.bills.length ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {data.bills.map((bill) => {
                  const days = daysBetween(data.today, bill.due_date);
                  const category = bill.budget_category_id ? byId.get(bill.budget_category_id) : undefined;
                  return (
                    <li key={bill.id} className="flex items-center gap-3 py-2.5">
                      <span className={`icon-tile size-9 ${days < 0 ? "bg-rose-50 text-rose-600" : category ? colorOf(category.color).tile : "bg-slate-100 text-slate-600"}`}>
                        <Icon name={bill.icon} className="size-4" />
                      </span>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setBillModal(bill)} title="Edit bill">
                        <p className="font-medium text-slate-800 hover:text-blue-700 sm:truncate">{bill.name}</p>
                        <p className={`text-xs ${days < 0 ? "text-rose-500" : days <= 3 ? "text-amber-600" : "text-slate-500"}`}>
                          {days < 0 ? `Overdue since ${formatDate(bill.due_date, "short")}` : `Due ${relativeDay(bill.due_date, data.today)}`}
                          {bill.repeats_monthly && " · monthly"}
                        </p>
                      </button>
                      <span className="whitespace-nowrap font-semibold text-slate-900">{money(Number(bill.amount))}</span>
                      <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => setPaying(bill)}>
                        Pay
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                <Receipt className="mx-auto mb-2 size-6 text-slate-300" />
                No bills waiting. Nice!
              </p>
            )}
          </section>
        </aside>
      </div>

      <Modal open={txModal !== null} onClose={() => setTxModal(null)} title={txModal === "new" ? "Add transaction" : "Edit transaction"}>
        {txModal !== null && (
          <TxForm
            tx={txModal === "new" ? undefined : txModal}
            categories={data.categories}
            defaultDate={data.month === thisMonth ? data.today : `${data.month}-01`}
            onClose={() => setTxModal(null)}
          />
        )}
      </Modal>
      <Modal open={catModal !== null} onClose={() => setCatModal(null)} title={catModal === "new" ? "Add budget category" : "Edit budget category"}>
        {catModal !== null && <CategoryForm category={catModal === "new" ? undefined : catModal} onClose={() => setCatModal(null)} />}
      </Modal>
      <Modal open={billModal !== null} onClose={() => setBillModal(null)} title={billModal === "new" ? "Add bill" : "Edit bill"}>
        {billModal !== null && (
          <BillForm
            bill={billModal === "new" ? undefined : billModal}
            categories={data.categories}
            today={data.today}
            onDelete={deleteBill}
            onClose={() => setBillModal(null)}
          />
        )}
      </Modal>
      <Modal open={paying !== null} onClose={() => setPaying(null)} title={paying ? `Pay ${paying.name}` : "Pay bill"} size="sm">
        {paying && <PayForm bill={paying} amount={money(Number(paying.amount))} onClose={() => setPaying(null)} />}
      </Modal>
    </>
  );
}

function SummaryCard({ label, icon: IconComponent, tile, value, note, valueClass = "text-slate-900" }: { label: string; icon: LucideIcon; tile: string; value: string; note: string; valueClass?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <span className={`icon-tile size-9 ${tile}`}>
          <IconComponent className="size-4.5" />
        </span>
      </div>
      <p className={`mt-2 truncate whitespace-nowrap text-lg font-bold min-[380px]:text-xl sm:text-2xl ${valueClass}`} title={typeof value === "string" ? value : undefined}>{value}</p>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

function TxForm({ tx, categories, defaultDate, onClose }: { tx?: Transaction; categories: BudgetCategory[]; defaultDate: string; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<Transaction["type"]>(tx?.type ?? "expense");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const category = String(form.get("budget_category_id") ?? "");
    const body = {
      type,
      amount: Number(form.get("amount")),
      description: String(form.get("description")),
      note: String(form.get("note")),
      method: String(form.get("method")),
      tx_date: String(form.get("tx_date")),
      budget_category_id: type === "income" || !category ? null : category,
    };
    setBusy(true);
    try {
      await api(tx ? `/finance/transactions/${tx.id}` : "/finance/transactions", { method: tx ? "PATCH" : "POST", body });
      await refresh("/finance");
      toast(tx ? "Transaction saved" : type === "income" ? "Income added" : "Expense added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!tx || !(await confirm({ title: "Delete this transaction?", message: toArchive(`“${tx.description}”`) }))) return;
    try {
      await api(`/finance/transactions/${tx.id}`, { method: "DELETE" });
      await refresh("/finance");
      toast("Transaction moved to the Archive");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented<Transaction["type"]>
        label="Type"
        value={type}
        onChange={setType}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount" htmlFor="tx-amount">
          <input id="tx-amount" name="amount" type="number" min={0.01} step={0.01} className="input" required defaultValue={tx ? Number(tx.amount) : undefined} autoFocus />
        </Field>
        <Field label="Date" htmlFor="tx-date">
          <input id="tx-date" name="tx_date" type="date" className="input" required defaultValue={tx?.tx_date ?? defaultDate} />
        </Field>
      </div>
      <Field label="Description" htmlFor="tx-desc">
        <input id="tx-desc" name="description" className="input" required maxLength={200} defaultValue={tx?.description} placeholder={type === "income" ? "e.g. Salary" : "e.g. Groceries"} autoComplete="off" />
      </Field>
      <Field label="Note (optional)" htmlFor="tx-note">
        <input id="tx-note" name="note" className="input" maxLength={200} defaultValue={tx?.note} placeholder={type === "income" ? "e.g. Monthly pay" : "e.g. Shwapno"} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {type === "expense" && (
          <Field label="Category" htmlFor="tx-category">
            <select id="tx-category" name="budget_category_id" className="select select-lg" defaultValue={tx?.budget_category_id ?? categories[0]?.id ?? ""}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="">No category</option>
            </select>
          </Field>
        )}
        <Field label={type === "income" ? "Received in" : "Paid with"} htmlFor="tx-method">
          <select id="tx-method" name="method" className="select select-lg" defaultValue={tx?.method ?? (type === "income" ? "Bank" : "bKash")}>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <ModalActions
        onCancel={onClose}
        submitLabel={tx ? "Save" : "Add"}
        busy={busy}
        left={
          tx && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}

function CategoryForm({ category, onClose }: { category?: BudgetCategory; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get("name")),
      monthly_limit: Number(form.get("monthly_limit")),
      color: String(form.get("color")),
      icon: String(form.get("icon")),
      is_savings: form.get("is_savings") === "on",
    };
    setBusy(true);
    try {
      await api(category ? `/finance/categories/${category.id}` : "/finance/categories", { method: category ? "PATCH" : "POST", body });
      await refresh("/finance");
      toast(category ? "Category saved" : "Category added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!category) return;
    const ok = await confirm({ title: `Delete “${category.name}”?`, message: `${toArchive(`“${category.name}”`)} Its transactions stay, without a category.` });
    if (!ok) return;
    try {
      await api(`/finance/categories/${category.id}`, { method: "DELETE" });
      await refresh("/finance");
      toast("Category moved to the Archive");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="cat-name">
          <input id="cat-name" name="name" className="input" required maxLength={40} defaultValue={category?.name} autoComplete="off" autoFocus />
        </Field>
        <Field label="Monthly limit" htmlFor="cat-limit">
          <input id="cat-limit" name="monthly_limit" type="number" min={0} step={1} className="input" required defaultValue={category ? Number(category.monthly_limit) : 5000} />
        </Field>
      </div>
      <Field label="Icon">
        <IconPicker name="icon" value={category?.icon ?? "wallet"} icons={MONEY_ICONS} />
      </Field>
      <Field label="Colour">
        <ColorPicker name="color" value={category?.color ?? "blue"} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" name="is_savings" className="checkbox checkbox-green" defaultChecked={category?.is_savings ?? false} />
        This is savings (counted as “Saved”, not “Spent”)
      </label>
      <ModalActions
        onCancel={onClose}
        submitLabel={category ? "Save" : "Add category"}
        busy={busy}
        left={
          category && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}

function BillForm({ bill, categories, today, onDelete, onClose }: { bill?: Bill; categories: BudgetCategory[]; today: string; onDelete: (bill: Bill) => void; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const category = String(form.get("budget_category_id"));
    const body = {
      name: String(form.get("name")),
      note: String(form.get("note")),
      amount: Number(form.get("amount")),
      due_date: String(form.get("due_date")),
      budget_category_id: category || null,
      icon: String(form.get("icon")),
      repeats_monthly: form.get("repeats_monthly") === "on",
    };
    setBusy(true);
    try {
      await api(bill ? `/finance/bills/${bill.id}` : "/finance/bills", { method: bill ? "PATCH" : "POST", body });
      await refresh("/finance");
      toast(bill ? "Bill saved" : "Bill added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" htmlFor="bill-name">
          <input id="bill-name" name="name" className="input" required maxLength={120} defaultValue={bill?.name} placeholder="e.g. Internet" autoComplete="off" autoFocus />
        </Field>
        <Field label="Note (optional)" htmlFor="bill-note">
          <input id="bill-note" name="note" className="input" maxLength={120} defaultValue={bill?.note} placeholder="e.g. Home broadband" autoComplete="off" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount" htmlFor="bill-amount">
          <input id="bill-amount" name="amount" type="number" min={0.01} step={0.01} className="input" required defaultValue={bill ? Number(bill.amount) : undefined} />
        </Field>
        <Field label="Due date" htmlFor="bill-due">
          <input id="bill-due" name="due_date" type="date" className="input" required defaultValue={bill?.due_date ?? today} />
        </Field>
      </div>
      <Field label="Budget category" htmlFor="bill-category" hint="The payment is counted in this category.">
        <select id="bill-category" name="budget_category_id" className="select select-lg" defaultValue={bill ? (bill.budget_category_id ?? "") : categories[0]?.id ?? ""}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value="">No category</option>
        </select>
      </Field>
      <Field label="Icon">
        <IconPicker name="icon" value={bill?.icon ?? "receipt"} icons={MONEY_ICONS} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" name="repeats_monthly" className="checkbox" defaultChecked={bill?.repeats_monthly ?? true} />
        Repeats every month (paying it adds next month’s bill)
      </label>
      <ModalActions
        onCancel={onClose}
        submitLabel={bill ? "Save" : "Add bill"}
        busy={busy}
        left={
          bill && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={() => onDelete(bill)}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}

function PayForm({ bill, amount, onClose }: { bill: Bill; amount: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const method = String(new FormData(e.currentTarget).get("method"));
    setBusy(true);
    try {
      await api(`/finance/bills/${bill.id}/pay`, { method: "POST", body: { method } });
      await refresh("/finance");
      toast(`${bill.name} paid${bill.repeats_monthly ? ". Next month's bill is added." : ""}`);
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600">
        <b className="text-slate-900">{amount}</b> is added to today’s expenses and the bill is marked paid.
      </p>
      <Field label="Paid with" htmlFor="pay-method">
        <select id="pay-method" name="method" className="select select-lg" defaultValue="bKash">
          {METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </Field>
      <ModalActions onCancel={onClose} submitLabel="Pay" busy={busy} />
    </form>
  );
}
