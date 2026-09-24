"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Icon } from "@/components/icon";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Role } from "@/engine/types";
import { cn } from "@/lib/utils";

export interface PaletteMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  actions: string[];
  roles: Role[];
  live: boolean;
  href: string;
}

interface CommandPaletteContextValue {
  open: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  open: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function CommandPaletteProvider({
  modes,
  children,
}: {
  modes: PaletteMode[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const open = useCallback(() => {
    setQuery("");
    setSelected(0);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isEditable(event.target) && isOpen) return;
        setIsOpen((v) => {
          if (!v) {
            setQuery("");
            setSelected(0);
          }
          return !v;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (mode: PaletteMode) =>
      !q ||
      mode.name.toLowerCase().includes(q) ||
      mode.id.toLowerCase().includes(q) ||
      mode.description.toLowerCase().includes(q) ||
      mode.actions.some((action) => action.toLowerCase().includes(q));
    const live = modes.filter((m) => m.live && match(m));
    const stubs = modes.filter((m) => !m.live && match(m));
    return [...live, ...stubs];
  }, [modes, query]);

  const stubStart = filtered.findIndex((m) => !m.live);

  function pick(mode: PaletteMode) {
    setIsOpen(false);
    router.push(mode.href);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const mode = filtered[selected];
      if (mode) pick(mode);
    }
  }

  return (
    <CommandPaletteContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="top-[20%] translate-y-0 gap-2 p-2 sm:max-w-md"
          showCloseButton={false}
          onKeyDown={onListKeyDown}
        >
          <DialogTitle className="sr-only">Search modes</DialogTitle>
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Search modes, actions…"
            className="h-8 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
          />
          <div className="max-h-80 overflow-y-auto">
            {filtered.map((mode, index) => (
              <div key={mode.id}>
                {index === stubStart && stubStart > 0 ? (
                  <div className="mx-2 my-1 border-t border-border" />
                ) : null}
                <button
                  type="button"
                  onClick={() => pick(mode)}
                  onMouseMove={() => setSelected(index)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs",
                    index === selected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground",
                  )}
                >
                  <Icon
                    name={mode.icon}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{mode.name}</span>
                  <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
                    {mode.actions.slice(0, 3).join(" ")}
                  </span>
                  {!mode.live ? (
                    <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                      not built
                    </span>
                  ) : null}
                </button>
              </div>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                Nothing matches.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  );
}
