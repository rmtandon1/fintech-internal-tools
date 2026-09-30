"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { awaitingPull } from "@/components/run-view";
import type { RunViewPayload } from "@/lib/devin-route";

const TICK_MS = 10_000;

/**
 * Watches every active run — not just the one on screen — so a run that
 * merges or lands in this checkout while the operator looks elsewhere still
 * refreshes the page. Polls `/api/devin/active`, then each reported run; a
 * change to a run's `status|awaitingPull` key triggers one refresh.
 */
export function RunWatcher() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** The last `status|awaitingPull` key seen per run id; first sightings are baselines. */
    const seen = new Map<string, string>();

    async function tick() {
      try {
        const res = await fetch("/api/devin/active");
        if (res.ok) {
          const { runIds } = (await res.json()) as { runIds: string[] };
          const payloads = await Promise.all(
            runIds.map((id) =>
              fetch(`/api/devin/${id}`)
                .then((r) => (r.ok ? (r.json() as Promise<RunViewPayload>) : null))
                .catch(() => null),
            ),
          );
          let changed = false;
          payloads.forEach((payload, i) => {
            const id = runIds[i];
            if (!payload) return;
            const key = `${payload.run.status}|${awaitingPull(payload)}`;
            if (seen.has(id) && seen.get(id) !== key) changed = true;
            seen.set(id, key);
          });
          const live = new Set(runIds);
          for (const id of [...seen.keys()]) {
            if (live.has(id)) continue;
            // Leaving the list (pulled, or stopped) is a change too.
            seen.delete(id);
            changed = true;
          }
          if (changed) router.refresh();
        }
      } catch {
        // A dropped poll is not worth surfacing; the next tick retries.
      }
      if (!cancelled) timer = setTimeout(tick, TICK_MS);
    }

    timer = setTimeout(tick, TICK_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return null;
}
