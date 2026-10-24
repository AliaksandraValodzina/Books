import type { NextConfig } from "next";

const config: NextConfig = {
  // `@resvg/resvg-js` is a native addon: it must be required at runtime from
  // the server bundle rather than traced and inlined by the bundler.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default config;
