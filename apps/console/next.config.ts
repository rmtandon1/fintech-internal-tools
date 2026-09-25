import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "@console/db",
    "@console/db-core",
    "@console/db-write",
    "@console/engine",
    "@console/permissions",
    "@console/tool-automation",
    "@console/tool-flags",
    "@console/tool-kyc",
    "@console/tool-refunds",
    "@console/ui",
  ],
};

export default nextConfig;
