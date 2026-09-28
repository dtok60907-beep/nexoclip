/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['studio', 'workflow-builder'],
  async rewrites() {
    const spiteUrl = process.env.SPITE_INTERNAL_URL || 'http://spite:3005';
    return [{ source: '/canvas', destination: `${spiteUrl}/spite` }, { source: '/canvas/:path*', destination: `${spiteUrl}/spite/:path*` }];
  },
};

export default nextConfig;
