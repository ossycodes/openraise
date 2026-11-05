import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the workspace package from source alongside the app.
  transpilePackages: ['@openraise/shared'],
};

export default nextConfig;
