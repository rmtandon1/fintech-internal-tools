import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  // Component tests render .tsx through react-dom/server.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The engine is transactional and each test file owns its own database.
    fileParallelism: false,
  },
});
