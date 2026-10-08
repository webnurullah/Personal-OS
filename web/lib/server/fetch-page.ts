// Reading a web page for the user (a job post, a course page). The server fetches whatever link it is given, so it
// must never be a way into private networks: every address is checked, also after each redirect.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./http.ts";

const MAX_BYTES = 3_000_000;

/** Private, loopback and link-local addresses: the server must never fetch those for a user. */
export function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivate(v6.slice(7));
    return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function checkHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "Use a link starting with https://");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new HttpError(400, "That website could not be found. Check the link.");
  if (addresses.some((a) => isPrivate(a.address))) throw new HttpError(400, "That link points to a private address.");
}

/**
 * The HTML of a page. `agent` names this app to the website; `hint` is added to the error messages
 * ("Paste the job post text instead.") so the person knows what to do when the site will not share its page.
 */
export async function fetchPage(link: string, { agent = "page reader", hint = "" } = {}) {
  let url = new URL(link);
  let res: Response | undefined;
  // Follow up to 3 redirects by hand, checking every address.
  for (let hop = 0; hop < 4; hop++) {
    await checkHost(url);
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": `Mozilla/5.0 (compatible; PersonalOS/1.0; ${agent})`, Accept: "text/html,application/xhtml+xml,text/plain" },
    }).catch(() => undefined);
    if (!res) throw new HttpError(422, `The website did not answer.${hint}`);
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      url = new URL(next, url);
      continue;
    }
    break;
  }
  if (!res?.ok) throw new HttpError(422, `The website refused to share the page (${res?.status}).${hint}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new HttpError(422, `That page is too big.${hint}`);
  return (await res.text()).slice(0, MAX_BYTES);
}
