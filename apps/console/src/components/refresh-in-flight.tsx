"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-render the server list while a run is in flight: the run row's status
 * only changes when the page re-reads `devin_runs`, so refresh every 5s.
 */
export function RefreshInFlight() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
