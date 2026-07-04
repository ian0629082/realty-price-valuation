import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開發模式下允許手機等區網裝置連線測試（預設只允許 localhost）
  allowedDevOrigins: ["192.168.0.48"],
};

export default nextConfig;
