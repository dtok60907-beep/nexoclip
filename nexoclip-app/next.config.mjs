/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['studio', 'workflow-builder'],
  async rewrites() {
    const spiteUrl = process.env.SPITE_INTERNAL_URL || 'http://spite:3005';
    // Keep the public URL as /canvas while forwarding to the same basePath
    // that the Spite service was built with. Do not redirect or iframe it.
    return {
      beforeFiles: [
        { source: '/canvas', destination: `${spiteUrl}/canvas` },
        { source: '/canvas/:path*', destination: `${spiteUrl}/canvas/:path*` },
      ],
    };
  },
};

export default nextConfig;
