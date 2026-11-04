import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A restored build cache served stale global CSS on Railway despite updated
  // source files. Compile production assets fresh; dev caching stays enabled.
  experimental: { turbopackFileSystemCacheForBuild: false },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "@prisma/adapter-pg",
    "pg",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
