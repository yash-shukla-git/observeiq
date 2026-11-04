import type { NextConfig } from "next";
import { config } from "dotenv";
import path from "path";

// Next only reads apps/dashboard/.env.local. Also read the repo's root .env for anything not set there
// (for example DATABASE_URL), so a value only has to be written once. Values already set are not replaced.
// The file is missing when the dashboard is deployed on its own, which is fine.
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  // the analysis package is TypeScript source in this monorepo, so Next has to compile it too
  transpilePackages: ["@observeiq/analysis"],
};

export default nextConfig;
