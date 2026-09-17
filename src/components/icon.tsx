"use client";

import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

const fallback = Icons.Square;

/** Resolves a lucide icon by the name a declaration supplies. */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Component =
    (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] ??
    fallback;
  return <Component {...props} />;
}
