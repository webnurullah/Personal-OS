"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Category, List, ProjectChoice } from "./types";

/** Your task/event/goal categories, plus a lookup by id. */
export function useCategories() {
  const { data } = useSWR<List<Category>>("/categories");
  const items = data?.items ?? [];
  const byId = new Map(items.map((c) => [c.id, c]));
  return { categories: items, byId };
}

/** Your projects as a short list (for pickers and badges), plus a lookup by id. */
export function useProjects() {
  const { data } = useSWR<List<ProjectChoice>>("/projects?lite=1");
  const items = data?.items ?? [];
  const byId = new Map(items.map((p) => [p.id, p]));
  return { projects: items, byId };
}

/** Minutes since midnight on this device, updated every minute (for "Now" markers). */
export function useNowMinutes() {
  const read = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setMinutes(read()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return minutes;
}
