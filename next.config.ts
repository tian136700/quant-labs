import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/zh/jp-lesson",
        destination: "/jp-lesson",
        permanent: false,
      },
      {
        source: "/zh/jp-lesson/:path*",
        destination: "/jp-lesson/:path*",
        permanent: false,
      },
      {
        source: "/zh/jp-vocab",
        destination: "/jp-vocab",
        permanent: false,
      },
      {
        source: "/zh/jp-vocab/:path*",
        destination: "/jp-vocab/:path*",
        permanent: false,
      },
      {
        source: "/zh/jp-review",
        destination: "/jp-review",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/trend-blog",
        destination: "/trend-blog/index.html",
      },
      {
        source: "/trend-blog/zh",
        destination: "/trend-blog/zh/index.html",
      },
      {
        source: "/zh/trend-blog",
        destination: "/trend-blog/zh/index.html",
      },
    ];
  },
};

export default nextConfig;
