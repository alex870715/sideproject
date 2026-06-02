import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "zh.wikipedia.org" },
      { protocol: "https", hostname: "en.wikipedia.org" },
      { protocol: "https", hostname: "ja.wikipedia.org" },
    ],
  },
};

export default nextConfig;
