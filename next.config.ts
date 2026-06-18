import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
