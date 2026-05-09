import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: `${__dirname}/../../..`,
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
