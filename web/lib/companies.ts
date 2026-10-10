// Job Apply → Company list: tidy names and links. Plain functions, shared by the server (which checks what is sent) and the page.

export type LinkKind = "website" | "facebook" | "linkedin";

const NETWORKS: Record<LinkKind, { label: string; hosts: string[] | null }> = {
  website: { label: "website", hosts: null },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me", "fb.watch"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"] },
};

/** A company name with the spaces tidied: "  Markopolo   AI " → "Markopolo AI". */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");

/** What two spellings of the same name share (capital letters and extra spaces do not count). */
export const companyKey = (name: string | null | undefined) => tidyName(name ?? "").toLowerCase();

/**
 * Reads a link that was typed or pasted: "markopolo.ai" becomes "https://markopolo.ai". Empty is fine (nothing given).
 * A Facebook or LinkedIn box only takes a link of that network, so a link is not put in the wrong box.
 */
export function readLink(kind: LinkKind, text: string): { link: string } | { problem: string } {
  const typed = text.trim();
  if (!typed) return { link: "" };
  const { label, hosts } = NETWORKS[kind];
  const bad = { problem: `That does not look like a ${label} link.` };
  if (/\s/.test(typed)) return bad;
  // Only web links: "mailto:", "javascript:", "ftp://" and the like are refused; "example.com:8080" has a port, not a scheme.
  if (/^(mailto|javascript|data|tel|file):/i.test(typed) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) && !/^https?:\/\//i.test(typed))) return bad;
  const link = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return bad;
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return bad;
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) return bad;
  if (link.length > 500) return { problem: "That link is too long (500 letters at most)." };
  return { link };
}

/** The label that goes with a link in the list ("Website", "Facebook", "LinkedIn"). */
export const linkLabel = (kind: LinkKind) => (kind === "website" ? "Website" : NETWORKS[kind].label);

/** Where a link goes, shortened for showing: "https://www.linkedin.com/company/markopolo/" → "linkedin.com/company/markopolo". */
export function shortLink(link: string) {
  return link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}
