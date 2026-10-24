import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The print render is a 3150 x 3150 rasterisation; it is not fast and it is
    // the thing most worth asserting on, so it gets room rather than a mock.
    testTimeout: 60_000,
  },
});
