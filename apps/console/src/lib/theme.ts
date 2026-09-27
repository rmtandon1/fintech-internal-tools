import { cookies } from "next/headers";

export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";

/** The theme picked with the home page toggle; light until one is picked. */
export async function currentTheme(): Promise<Theme> {
  const store = await cookies();
  return store.get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}
