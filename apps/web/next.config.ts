import type { NextConfig } from 'next';
const storage = new URL(
  process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:8333/openraise',
);
const nextConfig: NextConfig = {
  transpilePackages: ['@openraise/shared'],
  ...(process.env.CAMPAIGN_PREVIEW === 'true'
    ? { devIndicators: false as const }
    : {}),
  images: {
    remotePatterns: [
      {
        protocol: storage.protocol === 'https:' ? 'https' : 'http',
        hostname: storage.hostname,
        port: storage.port,
        pathname: `${storage.pathname.replace(/\/$/, '')}/**`,
      },
    ],
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
};
export default nextConfig;
