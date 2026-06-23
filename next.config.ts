import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/trend-blog",
        destination: "/trend-blog/index.html",
      },
      {
        source: "/zh/trend-blog",
        destination: "/trend-blog/zh/index.html",
      },
    ];
  },
};

export default nextConfig;
