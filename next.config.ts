import type { NextConfig } from "next";

const config: NextConfig = {
  /**
   * `@resvg/resvg-js` is a native addon. It must be required at runtime from
   * the server bundle rather than traced and inlined by the bundler.
   */
  serverExternalPackages: ["@resvg/resvg-js"],

  /**
   * **The deployment bug this closes, before it happens.**
   *
   * `public/` is served as static files and is *not* part of a serverless
   * function's filesystem; the fixture asset store is not either, because
   * nothing statically imports it. Both are read at runtime —
   * `lib/render/raster.ts` opens the two TTFs by path, and
   * `lib/assets/resolve.ts` reads a photograph's bytes — so without this the
   * print file would build cleanly, render locally, and come back from Vercel
   * with no type on it and no photographs in it.
   *
   * Listed per route rather than globally so the trace stays honest about which
   * route needs what.
   */
  outputFileTracingIncludes: {
    "/api/print": ["./public/fonts/*.ttf", "./fixtures/assets/*"],
    "/api/assets/[key]": ["./fixtures/assets/*"],
    "/": ["./fixtures/assets/*"],
  },
};

export default config;
