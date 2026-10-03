"use client";

import { useEffect, useRef } from "react";

/**
 * Opens a page's "New …" window when the URL has ?new=1 (from the Ctrl+K search),
 * or when the search asks for it while you are already on the page.
 */
export function useNewAction(open: () => void) {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url.pathname + url.search);
      openRef.current();
    }
    const handler = () => openRef.current();
    window.addEventListener("pos:new", handler);
    return () => window.removeEventListener("pos:new", handler);
  }, []);
}
