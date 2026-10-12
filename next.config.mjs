/**
 * The `src/` tree uses NodeNext-style `.js` import specifiers (e.g.
 * `import { bot } from "@/bot.js"`) that actually point at `.ts` files. `tsc`
 * (moduleResolution: "Bundler") accepts this, but Next's bundlers need to be
 * told to resolve a `.js` specifier to the corresponding `.ts`/`.tsx` source.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Turbopack (`next dev --turbopack` / `next build --turbopack`).
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  // Webpack (default `next dev` / `next build`).
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
