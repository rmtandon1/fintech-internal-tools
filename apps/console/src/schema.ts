/**
 * Aggregate schema for migrations: engine tables plus every tool's tables.
 * Each tool owns a `schema.ts` under `src/tools/<tool>/` and adds a single
 * line here. `src/db` knows only the engine tables.
 */
export * from "@console/db-core/engine-schema";
export { devinRuns } from "@console/tool-automation/schema";
export { featureFlags } from "@console/tool-flags/schema";
export { kycCases } from "@console/tool-kyc/schema";
export { refunds } from "@console/tool-refunds/schema";
