import { sqlite } from "@/db/client";

/**
 * Demo aid: edits an audit row behind the engine's back so /audit/verify has a
 * break to find. Takes the break type, defaulting to a rewritten summary.
 *
 *   pnpm db:tamper                 rewrite a row's summary  -> row_hash_mismatch
 *   pnpm db:tamper prev_mismatch   rewrite a row's prev hash
 *   pnpm db:tamper seq_gap         delete a row from the middle of the chain
 */
type Mode = "row_hash_mismatch" | "prev_mismatch" | "seq_gap";

const MODES: Mode[] = ["row_hash_mismatch", "prev_mismatch", "seq_gap"];
const requested = process.argv[2] ?? "row_hash_mismatch";
if (!MODES.includes(requested as Mode)) {
  console.error(`unknown mode "${requested}" — expected one of ${MODES.join(", ")}`);
  process.exit(1);
}
const mode = requested as Mode;

const rows = sqlite.prepare("select seq, id from audit_log order by seq").all() as {
  seq: number;
  id: string;
}[];

if (rows.length < 3) {
  console.error(
    `only ${rows.length} audit row(s) — run some governed actions first, then tamper`,
  );
  process.exit(1);
}

const target = rows[Math.floor(rows.length / 2)];

if (mode === "row_hash_mismatch") {
  sqlite
    .prepare("update audit_log set summary = ? where seq = ?")
    .run("Tampered outside the engine", target.seq);
} else if (mode === "prev_mismatch") {
  sqlite
    .prepare("update audit_log set prev_hash = ? where seq = ?")
    .run("0".repeat(64), target.seq);
} else {
  sqlite.prepare("delete from audit_log where seq = ?").run(target.seq);
}

console.log(`tampered seq ${target.seq} (${target.id}) — expect ${mode} at /audit/verify`);
