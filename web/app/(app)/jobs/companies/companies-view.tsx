"use client";

import { useState } from "react";
import useSWR from "swr";
import { Building2, ExternalLink, Globe, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toArchive } from "@/lib/archive";
import { api, errorMessage, refresh } from "@/lib/api";
import { companyKey, shortLink } from "@/lib/companies";
import { plural } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import type { Company, JobApplication, List } from "@/lib/types";
import { FacebookIcon, LinkedinIcon } from "@/components/ui/brand-icons";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { CompanyForm } from "../company-form";
import { JobsTabs } from "../jobs-tabs";

/** The companies you follow, with their website, Facebook and LinkedIn one tap away. */
export function CompaniesView() {
  const { data, error, mutate } = useSWR<List<Company>>("/companies");
  const { data: jobs } = useSWR<List<JobApplication>>("/jobs");
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [query, setQuery] = useState("");
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const companies = data.items;
  const jobsAt = (company: Company) => (jobs?.items ?? []).filter((j) => companyKey(j.company) === companyKey(company.name));
  const term = query.trim().toLowerCase();
  const visible = term ? companies.filter((c) => c.name.toLowerCase().includes(term) || c.note.toLowerCase().includes(term)) : companies;

  const remove = async (company: Company) => {
    if (!(await confirm({ title: "Delete this company?", message: toArchive(`“${company.name}”`), action: "Delete company" }))) return;
    try {
      await api(`/companies/${company.id}`, { method: "DELETE" });
      toast("Company moved to the Archive");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/companies");
  };

  const links = (company: Company) =>
    [
      { key: "website", href: company.website, label: "Website", icon: <Globe className="size-4" aria-hidden /> },
      { key: "facebook", href: company.facebook, label: "Facebook", icon: <FacebookIcon className="size-4 text-blue-600" /> },
      { key: "linkedin", href: company.linkedin, label: "LinkedIn", icon: <LinkedinIcon className="size-4 text-sky-700" /> },
    ].filter((l) => l.href);

  return (
    <>
      <PageHeader title="Company list" description="The companies you follow: where to find them on the web, Facebook and LinkedIn.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add Company
        </button>
      </PageHeader>
      <JobsTabs current="companies" />

      {companies.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={Building2} title="No companies yet" text="Add the companies you want to work for. You can also add one with a tap from a job on the Applications tab.">
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Add your first company
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          {companies.length > 5 && (
            <div className="relative mt-6 max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies" aria-label="Search companies" autoComplete="off" />
            </div>
          )}
          {visible.length ? (
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {visible.map((company) => {
                const jobsHere = jobsAt(company);
                const shown = links(company);
                return (
                  <li key={company.id} className="card p-5">
                    <div className="flex items-start gap-3">
                      <span className="icon-tile size-10 shrink-0 bg-indigo-50 text-indigo-600">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-semibold text-slate-900" title={company.name}>{company.name}</h2>
                        <p className="truncate text-sm text-slate-500">{jobsHere.length ? plural(jobsHere.length, "job") + " in Job Apply" : "No jobs in Job Apply yet"}</p>
                      </div>
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="btn btn-ghost btn-sm btn-icon text-slate-400 hover:text-blue-600" onClick={() => setEditing(company)} aria-label={`Edit ${company.name}`}>
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-icon text-slate-400 hover:text-rose-600" onClick={() => remove(company)} aria-label={`Delete ${company.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </div>
                    {shown.length > 0 ? (
                      <ul className="mt-4 flex flex-wrap gap-2">
                        {shown.map((l) => (
                          <li key={l.key} className="min-w-0 max-w-full">
                            <a href={l.href} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm max-w-full" title={l.href} aria-label={`${company.name} on ${l.label}: ${shortLink(l.href)}`}>
                              {l.icon}
                              <span className="truncate">{l.label}</span>
                              <ExternalLink className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm text-slate-400">
                        No links yet.{" "}
                        <button type="button" className="font-medium text-blue-600" onClick={() => setEditing(company)}>Add them</button>
                      </p>
                    )}
                    {company.note && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{company.note}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">No company matches “{query.trim()}”.</p>
          )}
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a company" : "Edit company"} description="Links can be typed without https://." size="md">
        {editing && <CompanyForm key={editing === "new" ? "new" : editing.id} company={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
