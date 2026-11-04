import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the analysis package is TypeScript source in this monorepo, so Next has to compile it too
  transpilePackages: ["@observeiq/analysis"],
};

export default nextConfig;
