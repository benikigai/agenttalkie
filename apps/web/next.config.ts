import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname, "../..") },
  // agent-core is a workspace package shipped as TypeScript source.
  transpilePackages: ["agent-core"],
};

export default nextConfig;
