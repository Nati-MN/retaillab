import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The generated Prisma client reads its WASM query compiler from disk at
  // runtime. Next's file tracing does not see that read, so serverless hosts
  // (Vercel) would deploy without the file. Include it explicitly.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;