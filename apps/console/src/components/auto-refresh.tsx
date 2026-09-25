"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page on an interval while something is in flight. */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
