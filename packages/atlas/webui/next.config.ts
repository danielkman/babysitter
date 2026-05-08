import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: `${__dirname}/../../..`,
    resolveAlias: {
      "@a5c-ai/atlas": "../dist/index.js",
    },
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
