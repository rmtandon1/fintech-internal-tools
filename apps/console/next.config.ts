import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@console/db",
    "@console/db-core",
    "@console/db-write",
    "@console/engine",
    "@console/permissions",
    "@console/tool-flags",
    "@console/tool-kyc",
    "@console/tool-refunds",
    "@console/ui",
  ],
};

export default nextConfig;
