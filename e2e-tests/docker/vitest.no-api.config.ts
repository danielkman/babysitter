import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    environment: "node",
    include: [
      "structural.test.ts",
      "stop-hook.test.ts",
      "pi-structural.test.ts",
      "pi-stop-hook.test.ts",
      "oh-my-pi-structural.test.ts",
      "oh-my-pi-stop-hook.test.ts",
      "gemini-cli-structural.test.ts",
      "paperclip-structural.test.ts",
    ],
    reporters: ["default", "json"],
    outputFile: {
      json: "../../e2e-artifacts/test-results.json",
    },
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
