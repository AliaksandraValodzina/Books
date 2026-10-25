import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `.tsx` as well as `.ts`, and this is not cosmetic: the pattern was
    // `test/**/*.test.ts`, which silently matches nothing in a `.tsx` file.
    // A test of a component would have been collected by no run and reported
    // by no failure — a green suite that was not running the test. Narrowing
    // the set of files a gate looks at is the exact mistake that let 92 dead
    // assertions accumulate in Keepnook, so `test/config.test.ts` now asserts
    // that every `test/*.test.*` file on disk is one this pattern collects.
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    // The print render is a 3150 x 3150 rasterisation; it is not fast and it is
    // the thing most worth asserting on, so it gets room rather than a mock.
    testTimeout: 60_000,
  },
});
