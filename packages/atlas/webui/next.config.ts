import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // In Docker the workspace is flattened — skip monorepo root override
    ...(process.env.DOCKER_BUILD ? {} : { root: `${__dirname}/../../..` }),
  },
  serverExternalPackages: ["pg"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        pg: false,
        "pg-native": false,
      };
    }
    return config;
  },
};

export default nextConfig;
