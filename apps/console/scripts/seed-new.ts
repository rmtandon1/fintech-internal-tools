import { seedNewTools } from "@/lib/seed-new-tools";

/**
 * Seeds only the registered tools whose queue is still empty — the safe
 * follow-up to `db:migrate` after a merge adds a tool, where `db:seed` would
 * re-seed live data. The merge sync reads the final line as its result.
 */
const seeded = seedNewTools();
console.log(JSON.stringify({ seeded }));
