import { configureEngine } from "@console/engine/registry";
import { toolRegistry } from "@/registry";

/**
 * The one place the application wires tools into the engine. Imported by the
 * root layout and the server actions so the engine is configured before any
 * request reaches it.
 */
configureEngine({ tools: toolRegistry });
