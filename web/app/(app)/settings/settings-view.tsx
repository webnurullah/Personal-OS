"use client";

import { toArchive } from "@/lib/archive";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Bell, Camera, Database, Download, KeyRound, Pencil, Plus, ShieldCheck, SlidersHorizontal, Sparkles, Tag, Trash2, User, X, type LucideIcon } from "lucide-react";
import { api, download, errorMessage, refresh, refreshAll } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { createClient } from "@/lib/supabase/client";
import type { Category, List, NotifyKey, Profile } from "@/lib/types";
import { ColorPicker, Field, Switch } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { Avatar } from "@/components/shell/topbar";
import { AvatarEditor } from "./avatar-editor";

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & privacy", icon: ShieldCheck },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const NOTIFY: { key: NotifyKey; title: string; text: string }[] = [
  { key: "morning_plan", title: "Morning plan", text: "Today's tasks and events at the top of the bell menu" },
  { key: "habit_reminder", title: "Habit reminder", text: "From 6 PM, a nudge for habits not ticked yet" },
  { key: "bills_due", title: "Bills due", text: "Three days before each bill is due, and when it is overdue" },
  { key: "study_sessions", title: "Study sessions", text: "Learning blocks planned for today and not done yet" },
  { key: "weekly_review", title: "Weekly review", text: "On Sundays, a reminder to look back at your week" },
];

/** Saves profile changes and keeps every page that shows them up to date. */
function useSaveProfile() {
  const { mutate } = useSWR<Profile>("/profile");
  const { toast } = useFeedback();
  return async (changes: Omit<Partial<Profile>, "notify"> & { notify?: Partial<Record<NotifyKey, boolean>> }, message?: string, reloadAll = false) => {
    try {
      const updated = await api<Profile>("/profile", { method: "PATCH", body: changes });
      await mutate(updated, { revalidate: false });
      if (reloadAll) await refreshAll();
      else await refresh("/notifications");
      if (message) toast(message);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      await mutate();
      return false;
    }
  };
}

export function SettingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.find((t) => t.id === requested)?.id ?? "profile";
  const { data: profile, error, mutate } = useSWR<Profile>("/profile");
  const tabs = useRef<HTMLDivElement>(null);
  const loaded = profile !== undefined;
  // On a phone the tabs scroll sideways: keep the open one in view (it may be far to the right when opened from a link).
  useEffect(() => {
    tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tab, loaded]);

  if (error && !profile) return <LoadError error={error} retry={() => mutate()} />;
  if (!profile) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader title="Settings" description="Make the app work the way you do." />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div ref={tabs} role="tablist" aria-orientation="vertical" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:self-start lg:pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              className="side-tab"
              onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })}
            >
              <t.icon className="size-4.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === "profile" && <ProfileTab profile={profile} />}
          {tab === "preferences" && <PreferencesTab profile={profile} />}
          {tab === "categories" && <CategoriesTab />}
          {tab === "notifications" && <NotificationsTab profile={profile} />}
          {tab === "data" && <DataTab />}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, text, children, className = "" }: { title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{text}</p>
      {children}
    </section>
  );
}

function SaveRow({ busy, label = "Save changes" }: { busy: boolean; label?: string }) {
  return (
    <div className="flex justify-end border-t border-slate-100 pt-5">
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

// ---------- Profile ----------

function ProfileTab({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    await save({ full_name: String(form.get("full_name")), tagline: String(form.get("tagline")), city: String(form.get("city")) }, "Profile saved");
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <Panel title="Profile" text="How you appear in the app.">
        <PhotoRow profile={profile} />
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="p-name">
              <input id="p-name" name="full_name" className="input" maxLength={80} defaultValue={profile.full_name} autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="p-email" hint="The address you sign in with.">
              <input id="p-email" type="email" className="input" value={profile.email} readOnly disabled />
            </Field>
            <Field label="Tagline" htmlFor="p-tagline">
              <input id="p-tagline" name="tagline" className="input" maxLength={120} defaultValue={profile.tagline} placeholder="A better you, every day" />
            </Field>
            <Field label="City" htmlFor="p-city">
              <input id="p-city" name="city" className="input" maxLength={80} defaultValue={profile.city} placeholder="Dhaka, Bangladesh" />
            </Field>
          </div>
          <SaveRow busy={busy} />
        </form>
      </Panel>
      <PasswordPanel />
    </div>
  );
}

/** The round photo with its Upload / Change / Remove buttons. Big phone photos are fine: they are resized before they are sent. */
function PhotoRow({ profile }: { profile: Profile }) {
  const { mutate } = useSWR<Profile>("/profile");
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const hasPhoto = Boolean(profile.avatar_url);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same picture again still counts
    if (file) setPicked(file);
  };

  // Throws when it fails, so the editor stays open and shows the message.
  const upload = async (picture: Blob) => {
    const updated = await api<Profile>("/profile/avatar", { method: "POST", file: picture });
    await mutate(updated, { revalidate: false });
    setPicked(null);
    toast("Profile photo saved");
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const updated = await api<Profile>("/profile/avatar", { method: "DELETE" });
      await mutate(updated, { revalidate: false });
      toast("Profile photo removed");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-20 shrink-0 ring-4" src={profile.avatar_url} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{profile.full_name || "Your name"}</p>
          <p className="truncate text-sm text-slate-500">{profile.tagline || "Add a tagline below"}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Choose a profile photo" onChange={choose} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>
          <Camera className="size-4" />
          {hasPhoto ? "Change photo" : "Upload photo"}
        </button>
        {hasPhoto && (
          <button type="button" className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
      <AvatarEditor file={picked} onClose={() => setPicked(null)} onUse={upload} />
    </div>
  );
}

function PasswordPanel() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      toast("The two passwords are not the same.", "error");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    formElement.reset();
    toast("Password changed");
  };

  return (
    <Panel title="Password" text="Use at least 8 characters. A short sentence is easy to remember and hard to guess.">
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="pw-new">
            <input id="pw-new" name="password" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Type it again" htmlFor="pw-confirm">
            <input id="pw-confirm" name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-5">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <KeyRound className="size-4" />
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

// ---------- Preferences ----------

function zoneLabel(zone: string) {
  try {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    return offset ? `${zone.replace(/_/g, " ")} (${offset})` : zone;
  } catch {
    return zone;
  }
}

function PreferencesTab({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const [busy, setBusy] = useState(false);
  const [zones] = useState(() => {
    const list: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...new Set(["Asia/Dhaka", "UTC", ...list, profile.timezone])];
  });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const changes = {
      timezone: String(form.get("timezone")),
      currency: String(form.get("currency")) as Profile["currency"],
      week_start: Number(form.get("week_start")),
      time_format: String(form.get("time_format")) as Profile["time_format"],
      weekly_study_goal: Number(form.get("weekly_study_goal")),
      step_goal: Number(form.get("step_goal")),
      sleep_goal_minutes: Math.round(Number(form.get("sleep_goal_hours")) * 60),
      water_goal: Number(form.get("water_goal")),
    };
    setBusy(true);
    // A new time zone can change what "today" is, so every page reloads its data.
    await save(changes, "Preferences saved", changes.timezone !== profile.timezone);
    setBusy(false);
  };

  return (
    <Panel title="Preferences" text="Time, money and your daily goals.">
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Time zone" htmlFor="s-tz" hint="Decides when your day starts and ends.">
            <select id="s-tz" name="timezone" className="select select-lg" defaultValue={profile.timezone}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>{zoneLabel(zone)}</option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor="s-currency">
            <select id="s-currency" name="currency" className="select select-lg" defaultValue={profile.currency}>
              <option value="BDT">Bangladeshi Taka (৳ BDT)</option>
              <option value="USD">US Dollar ($ USD)</option>
            </select>
          </Field>
          <Field label="Week starts on" htmlFor="s-week" hint="Used by the calendar.">
            <select id="s-week" name="week_start" className="select select-lg" defaultValue={profile.week_start}>
              {[6, 0, 1, 2, 3, 4, 5].map((day) => (
                <option key={day} value={day}>{WEEKDAYS[day]}</option>
              ))}
            </select>
          </Field>
          <Field label="Time format" htmlFor="s-time">
            <select id="s-time" name="time_format" className="select select-lg" defaultValue={profile.time_format}>
              <option value="12h">12-hour (1:30 PM)</option>
              <option value="24h">24-hour (13:30)</option>
            </select>
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Goals</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Field label="Study hours a week" htmlFor="s-study" hint="For new weeks.">
              <input id="s-study" name="weekly_study_goal" type="number" min={0.5} max={100} step={0.5} className="input" required defaultValue={Number(profile.weekly_study_goal)} />
            </Field>
            <Field label="Steps a day" htmlFor="s-steps">
              <input id="s-steps" name="step_goal" type="number" min={1} max={100000} step={1} className="input" required defaultValue={profile.step_goal} />
            </Field>
            <Field label="Sleep (hours)" htmlFor="s-sleep">
              <input id="s-sleep" name="sleep_goal_hours" type="number" min={1} max={16} step="any" className="input" required defaultValue={profile.sleep_goal_minutes / 60} />
            </Field>
            <Field label="Glasses of water" htmlFor="s-water">
              <input id="s-water" name="water_goal" type="number" min={1} max={30} className="input" required defaultValue={profile.water_goal} />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="text-sm font-medium text-slate-800">Hide money amounts</p>
            <p className="text-xs text-slate-500">Useful when someone is looking at your screen. Saved straight away.</p>
          </div>
          <Switch checked={profile.hide_amounts} onChange={(checked) => save({ hide_amounts: checked }, checked ? "Amounts hidden" : "Amounts shown")} label="Hide money amounts" />
        </div>

        <SaveRow busy={busy} />
      </form>
    </Panel>
  );
}

// ---------- Categories ----------

function CategoriesTab() {
  const { data } = useSWR<List<Category>>("/categories");
  const categories = data?.items ?? [];
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [formKey, setFormKey] = useState(0);

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/categories", { method: "POST", body: { name: String(form.get("name")), color: String(form.get("color")) } });
      await refresh("/categories");
      toast("Category added");
      setFormKey((k) => k + 1);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: Category) => {
    const ok = await confirm({ title: `Delete “${category.name}”?`, message: `${toArchive(`“${category.name}”`)} Tasks, events and goals in it stay, without a category (restoring it puts them back).` });
    if (!ok) return;
    try {
      await api(`/categories/${category.id}`, { method: "DELETE" });
      toast("Category moved to the Archive");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    await refresh("/categories", "/tasks", "/events", "/goals");
  };

  return (
    <Panel title="Categories" text="Used by tasks, events and goals. Money has its own categories on the Finance page.">
      {!data ? (
        <div className="mt-6 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-9 w-24 rounded-full" />
          ))}
        </div>
      ) : categories.length ? (
        <ul className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-1.5 text-sm font-medium text-slate-700">
              <span className={`size-2.5 rounded-full ${colorOf(c.color).dot}`} />
              {c.name}
              <button type="button" className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                <Pencil className="size-3.5" />
              </button>
              <button type="button" className="-ml-2 grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-slate-500">No categories yet.</p>
      )}

      <form key={formKey} onSubmit={add} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="New category" htmlFor="c-name" className="min-w-48 flex-1">
            <input id="c-name" name="name" className="input" required maxLength={40} placeholder="e.g. Family" autoComplete="off" />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Plus className="size-4" />
            Add
          </button>
        </div>
        <ColorPicker name="color" value="pink" />
      </form>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit category" size="sm">
        {editing && <CategoryForm category={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </Panel>
  );
}

function CategoryForm({ category, onClose }: { category: Category; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/categories/${category.id}`, { method: "PATCH", body: { name: String(form.get("name")), color: String(form.get("color")) } });
      await refresh("/categories", "/tasks", "/events", "/goals");
      toast("Category saved");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" htmlFor="ce-name">
        <input id="ce-name" name="name" className="input" required maxLength={40} defaultValue={category.name} autoComplete="off" autoFocus />
      </Field>
      <Field label="Colour">
        <ColorPicker name="color" value={category.color} />
      </Field>
      <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} />
    </form>
  );
}

// ---------- Notifications ----------

function NotificationsTab({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  return (
    <Panel title="Notifications" text="Choose what shows in the bell menu at the top of every page.">
      <ul className="mt-4 divide-y divide-slate-100">
        {NOTIFY.map((n) => (
          <li key={n.key} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-slate-800">{n.title}</p>
              <p className="text-xs text-slate-500">{n.text}</p>
            </div>
            <Switch checked={profile.notify?.[n.key] ?? false} onChange={(checked) => save({ notify: { [n.key]: checked } })} label={n.title} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------- Data & privacy ----------

function DataTab() {
  const { toast } = useFeedback();
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  const exportAll = async () => {
    setExporting(true);
    try {
      await download("/data/export", "pos-export.json");
      toast("Export downloaded");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const loadSample = async () => {
    setLoading(true);
    try {
      await api("/data/sample-data", { method: "POST" });
      await refreshAll();
      toast("Sample data loaded. Have a look around!");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteAll = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await api("/data/delete-all", { method: "POST", body: { confirm: typed } });
      await refreshAll();
      setTyped("");
      toast("All your data is deleted");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel title="Your data" text="It is yours. Take a copy any time.">
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={exportAll} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? "Preparing…" : "Export everything (JSON)"}
          </button>
        </div>
        <p className="mt-4 flex gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
          <Database className="mt-0.5 size-4 shrink-0" />
          Your data is stored in your own Supabase database. Only you can read it: every table checks that rows belong to the signed-in account.
        </p>
      </Panel>

      <Panel title="Sample data" text="Fill an empty account with example tasks, habits, a course, money and more, to try things out.">
        <button type="button" className="btn btn-secondary mt-5" onClick={loadSample} disabled={loading}>
          <Sparkles className="size-4" />
          {loading ? "Loading…" : "Load sample data"}
        </button>
        <p className="mt-2 text-xs text-slate-500">Only works while your account is empty. Delete it all below when you are ready to start for real.</p>
      </Panel>

      <Panel title="Danger zone" text="Deletes every task, event, goal, habit, course, transaction, health log, note and reminder. Your account and settings stay. This cannot be undone." className="border-rose-200">
        <form onSubmit={deleteAll} className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Type DELETE to confirm" htmlFor="del-confirm" className="min-w-48">
            <input id="del-confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="DELETE" />
          </Field>
          <button type="submit" className="btn btn-danger" disabled={typed !== "DELETE" || deleting}>
            <Trash2 className="size-4" />
            {deleting ? "Deleting…" : "Delete all my data"}
          </button>
        </form>
      </Panel>
    </div>
  );
}
