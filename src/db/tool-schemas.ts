/**
 * Re-exports of per-tool table definitions. Each tool owns a `schema.ts` under
 * `src/tools/<tool>/` and adds a single line here; nothing else in the app
 * needs to change when a tool is added or removed.
 */
export { kycCases } from "@/tools/kyc/schema";
export { refunds } from "@/tools/refunds/schema";
