import type { SVGProps } from "react";

// Small Facebook and LinkedIn marks (this icon set has no brand icons). They take the colour of the text around them.
export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M13.4 19v-5.6h1.9l.4-2.4h-2.3V9.7c0-.7.3-1.2 1.3-1.2h1.1V6.4c-.3 0-1-.1-1.8-.1-1.9 0-3.1 1.1-3.1 3.2V11H8.9v2.4h2V19Z" fill="#fff" />
    </svg>
  );
}

export function LinkedinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3.5" fill="currentColor" />
      <rect x="6.3" y="10" width="2.4" height="7.4" fill="#fff" />
      <circle cx="7.5" cy="7.6" r="1.4" fill="#fff" />
      <path d="M11 10h2.3v1c.4-.7 1.2-1.2 2.4-1.2 2.3 0 2.8 1.5 2.8 3.5v4.1h-2.4v-3.6c0-.9 0-2-1.2-2s-1.4.9-1.4 1.9v3.7H11Z" fill="#fff" />
    </svg>
  );
}
