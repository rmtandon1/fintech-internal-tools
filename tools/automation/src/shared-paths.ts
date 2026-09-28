/**
 * Paths shared by every tool — the engine packages, migrations, the actions
 * file, shared components and `AGENTS.md`. A spec that needs one lists it in
 * its own `allowedPaths`; the run guard reports which of these a diff
 * touched so the engine owner's CODEOWNERS review is expected, and the
 * console uses the same list to say so on screen.
 */
export const SHARED_PATHS: readonly string[] = [
  "packages/engine/**",
  "packages/db/**",
  "packages/db-core/**",
  "packages/db-write/**",
  "packages/permissions/**",
  "apps/console/drizzle/**",
  "apps/console/src/app/actions.ts",
  "apps/console/src/components/**",
  "AGENTS.md",
];

/** `**` spans directories, `*` and `?` stay within one segment; everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(re + "$");
}

const SHARED_REGEXPS = SHARED_PATHS.map(globToRegExp);

/** True when `path` matches one of the shared-path globs. */
export function touchesSharedPath(path: string): boolean {
  return SHARED_REGEXPS.some((re) => re.test(path));
}
