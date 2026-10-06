import type { Metadata } from "next";
import { Caveat, Inter, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-caveat", display: "swap" });
// Only used for the ৳ sign, so it looks the same on every computer.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "600", "700"], variable: "--font-bengali", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Personal OS", template: "%s · POS" },
  description: "life management system: tasks, habits, goals, learning, money and health in one place.",
  // A private app: keep it out of search engines.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${caveat.variable} ${bengali.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
