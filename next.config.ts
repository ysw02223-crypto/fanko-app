import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/shipping/export": ["./public/shipter-template.xlsx"],
  },
};

export default nextConfig;
