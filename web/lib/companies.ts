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
  // No spaces or control characters (a tab, a line break, NUL …) anywhere in a link.
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(typed)) return bad;
  // Only web links: "mailto:", "javascript:", "ftp://" and the like are refused; "example.com:8080" has a port, not a scheme.
  if (/^(mailto|javascript|data|tel|file):/i.test(typed) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) && !/^https?:\/\//i.test(typed))) return bad;
  // "//example.com" (a link copied without its scheme) is read as "example.com".
  const bare = typed.replace(/^\/\/+/, "");
  if (!bare) return bad;
  const link = /^https?:\/\//i.test(bare) ? bare : `https://${bare}`;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return bad;
  }
  const host = url.hostname.toLowerCase();
  // A real host: dotted, no empty part, and its last part is a name (a lone number such as "2026" would be read as an IP address).
  const parts = host.split(".");
  if (parts.length < 2 || parts.some((part) => part === "") || !/[a-z]/.test(parts[parts.length - 1])) return bad;
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) return bad;
  if (link.length > 500) return { problem: "That link is too long (500 letters at most, with https:// in front)." };
  return { link };
}

/** The label that goes with a link in the list ("Website", "Facebook", "LinkedIn"). */
export const linkLabel = (kind: LinkKind) => (kind === "website" ? "Website" : NETWORKS[kind].label);

/** Where a link goes, shortened for showing: "https://www.linkedin.com/company/markopolo/" → "linkedin.com/company/markopolo". */
export function shortLink(link: string) {
  return link.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}
