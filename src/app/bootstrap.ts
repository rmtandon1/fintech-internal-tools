import { configureEngine } from "@/engine/registry";
import { toolRegistry } from "@/tools";

/**
 * The one place the application wires tools into the engine. Imported by the
 * root layout and the server actions so the engine is configured before any
 * request reaches it.
 */
configureEngine({ tools: toolRegistry });
