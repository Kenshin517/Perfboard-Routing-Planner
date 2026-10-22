import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Keep this "@" alias pointing at the same place as tsconfig's "@/*" paths.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Engine is pure TS, no DOM needed. UI (Canvas/React) is not unit-tested in v1.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
