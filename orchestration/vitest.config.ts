import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.d.ts",
      "**/test/integration/self-test.integration.test.ts",
      "**/test/integration/initialize-project.integration.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "test/**",
        "**/*.d.ts",
        "**/*.config.ts",
        "**/*.test.ts",
      ],
    },
  },
});
