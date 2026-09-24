/**
 * Aggregate schema for migrations: engine tables plus every tool's tables.
 * Each tool owns a `schema.ts` under `src/tools/<tool>/` and adds a single
 * line here. `src/db` knows only the engine tables.
 */
export * from "@/db/engine-schema";
export { featureFlags } from "@/tools/flags/schema";
export { kycCases } from "@/tools/kyc/schema";
export { refunds } from "@/tools/refunds/schema";
