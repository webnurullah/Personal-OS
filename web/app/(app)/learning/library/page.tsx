import type { Metadata } from "next";
import { LibraryView } from "./library-view";

export const metadata: Metadata = { title: "Certificates & playlists" };

export default function LibraryPage() {
  return <LibraryView />;
}
