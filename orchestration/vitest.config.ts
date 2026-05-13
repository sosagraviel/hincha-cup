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
      "**/test/integration/phase1-automation-detection.integration.test.ts",
      // The fixture trees under
      // test/integration/initialize-project/projects/<fixture>/qubika-agentic-framework
      // are symlinks back to the framework root. Without this exclude,
      // vitest discovers `test/unit/**` via each symlink and runs the
      // same suite N+1 times.
      "**/test/integration/initialize-project/projects/**",
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
