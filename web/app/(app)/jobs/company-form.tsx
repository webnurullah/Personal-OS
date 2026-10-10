"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage, refresh } from "@/lib/api";
import { readLink, type LinkKind } from "@/lib/companies";
import type { Company } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";

/** Add or change a company: its name and where to find it (website, Facebook, LinkedIn). The links may be typed without "https://". */
export function CompanyForm({ company, name: firstName = "", onClose, onSaved }: { company: Company | null; name?: string; onClose: () => void; onSaved?: (saved: Company) => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  // The cursor starts in the first box to fill: the name, or the website when the name is already there (from a job). It waits a tick
  // because the dialog is only shown after this form is drawn, and a hidden box cannot take the cursor.
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const tick = setTimeout(() => first.current?.focus(), 0);
    return () => clearTimeout(tick);
  }, []);
  // A save can finish after the dialog was closed (Cancel, or another job's dialog opened): then it only shows the toast.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    // Check the links here so the problem is shown at once, naming the box it is in.
    const links: Record<LinkKind, string> = { website: "", facebook: "", linkedin: "" };
    for (const [kind, label] of [["website", "Website"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"]] as const) {
      const read = readLink(kind, text(kind));
      if ("problem" in read) {
        toast(`${label}: ${read.problem}`, "error");
        return;
      }
      links[kind] = read.link;
    }
    setBusy(true);
    try {
      const saved = await api<Company>(company ? `/companies/${company.id}` : "/companies", {
        method: company ? "PATCH" : "POST",
        body: { name: text("name"), ...links, note: text("note") },
      });
      await refresh("/companies");
      toast(company ? "Company saved" : `${saved.name} added to your company list`);
      if (mounted.current) {
        onSaved?.(saved);
        onClose();
      }
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Company name" htmlFor="company-name">
        <input id="company-name" name="name" className="input" required maxLength={200} defaultValue={company?.name ?? firstName} placeholder="e.g. Markopolo AI INC" autoComplete="off" ref={firstName ? undefined : first} />
      </Field>
      <Field label="Website (optional)" htmlFor="company-website">
        <input id="company-website" name="website" className="input" inputMode="url" maxLength={500} defaultValue={company?.website} placeholder="e.g. markopolo.ai" autoComplete="off" ref={firstName ? first : undefined} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Facebook (optional)" htmlFor="company-facebook">
          <input id="company-facebook" name="facebook" className="input" inputMode="url" maxLength={500} defaultValue={company?.facebook} placeholder="facebook.com/…" autoComplete="off" />
        </Field>
        <Field label="LinkedIn (optional)" htmlFor="company-linkedin">
          <input id="company-linkedin" name="linkedin" className="input" inputMode="url" maxLength={500} defaultValue={company?.linkedin} placeholder="linkedin.com/company/…" autoComplete="off" />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="company-note">
        <textarea id="company-note" name="note" className="input min-h-20" maxLength={1000} defaultValue={company?.note} placeholder="Who to ask, what they do, when to apply again…" />
      </Field>
      <ModalActions onCancel={onClose} submitLabel={company ? "Save company" : "Add company"} busy={busy} />
    </form>
  );
}
