// Notes are plain text. Web addresses in them become links (only http and https, nothing else), the rest stays as it was typed.

export type Piece = { text: string; href?: string };

const ADDRESS = /https?:\/\/[^\s<>"'`]+/gi;
/** What cannot end an address: it belongs to the sentence ("see https://x.com/a, then …"). */
const TRAILING = /[.,;:!?)\]}»”’]+$/;

/** The text cut into pieces: plain text and addresses. Joining the `text` of every piece gives the original text back. */
export function splitLinks(text: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0;
    const href = match[0].replace(TRAILING, "");
    // "https://" alone, or an address that is only a scheme, is not a link.
    if (!/^https?:\/\/[^/?#\s]+/i.test(href)) continue;
    if (start > last) pieces.push({ text: text.slice(last, start) });
    pieces.push({ text: href, href });
    last = start + href.length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}

/** The address of a public page for these notes, on the same site you are on. */
export const publicNotesUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/shared/course/${token}`;

/** A link code is a UUID (the public page checks this before it asks the database anything). */
export const isLinkCode = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
