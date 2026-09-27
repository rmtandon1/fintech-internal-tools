"use client";

import { useState, useTransition } from "react";
import { setTheme } from "@/app/actions";
import { Icon } from "@console/ui/icon";
import type { Theme } from "@/lib/theme";

/** Sun and moon switch. The page flips at once; the cookie keeps the choice. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setLocal] = useState<Theme>(initial);
  const [, startTransition] = useTransition();
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setLocal(next);
        document.documentElement.classList.toggle("dark", next === "dark");
        startTransition(() => setTheme(next));
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon name={theme === "dark" ? "Sun" : "Moon"} className="size-[18px]" />
    </button>
  );
}
