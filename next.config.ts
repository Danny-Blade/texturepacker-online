import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle at .next/standalone so the Docker
  // runner image can start with `node server.js` without carrying node_modules.
  output: 'standalone',
};

export default nextConfig;
