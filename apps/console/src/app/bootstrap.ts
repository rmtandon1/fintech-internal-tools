import { configureEngine } from "@console/engine/registry";
import { registerToolConstants } from "@/lib/register-tool-constants";
import { toolRegistry } from "@/registry";

/**
 * The one place the application wires tools into the engine. Imported by the
 * root layout and the server actions so the engine is configured before any
 * request reaches it.
 */
configureEngine({ tools: toolRegistry });

// Also registered on server start (instrumentation), but a merge pulled into
// a running console only loads its new tool code when this module is
// evaluated again, so its new settings are registered here too. Existing
// values are never overwritten.
registerToolConstants();
