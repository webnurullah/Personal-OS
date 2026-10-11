/**
 * A web address typed into a link box: "example.com" gets https://, and only http and https addresses are kept
 * (null for anything else: "javascript:…", "mailto:…", words with spaces, nothing).
 */
export function webAddress(typed: string) {
  const text = typed.trim();
  if (!text || /[\s\u0000-\u001f\u007f-\u009f]/.test(text)) return null;
  // "example.com:8080/x" has a port, not a scheme; "//example.com" is an address without its scheme.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(text);
  const withScheme = hasScheme ? text : `https://${text.replace(/^\/\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
