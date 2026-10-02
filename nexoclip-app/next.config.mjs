import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['studio', 'workflow-builder'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
      '../../../../components/DurableJobHistory.js': path.resolve(__dirname, 'components/DurableJobHistory.js'),
    };
    return config;
  },
  async rewrites() {
    const spiteUrl = process.env.SPITE_INTERNAL_URL;
    if (!spiteUrl) return [];
    return {
      beforeFiles: [
        { source: '/canvas', destination: `${spiteUrl}/canvas` },
        { source: '/canvas/:path*', destination: `${spiteUrl}/canvas/:path*` },
      ],
    };
  },
};

export default nextConfig;
