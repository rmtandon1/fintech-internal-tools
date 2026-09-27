"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keep the server list live while runs are in flight. Each tick observes the
 * in-flight runs through `/api/devin/<id>` (which polls Devin and records an
 * ended session) and then re-renders the page so the rows re-read `devin_runs`.
 */
export function RefreshInFlight({ runIds }: { runIds: string[] }) {
  const router = useRouter();
  const key = runIds.join(",");
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      await Promise.all(
        key.split(",").filter(Boolean).map((id) => fetch(`/api/devin/${id}`).catch(() => null)),
      );
      if (!cancelled) router.refresh();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [router, key]);
  return null;
}
