import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Engine is pure TS, no DOM needed. UI (Canvas/React) is not unit-tested in v1.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
