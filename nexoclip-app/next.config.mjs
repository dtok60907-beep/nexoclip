/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['studio', 'workflow-builder'],
  // @remotion/lottie imports the full lottie-web, whose expression support runs code from the animation file
  // (eval). Motion plays files users upload or link, so it gets the light SVG build, which has no expressions.
  turbopack: { resolveAlias: { 'lottie-web': 'lottie-web/build/player/lottie_light.js' } },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, 'lottie-web$': 'lottie-web/build/player/lottie_light.js' };
    return config;
  },
  async redirects() {
    return [
      { source: '/login', destination: '/studio/home?auth=login', permanent: false },
      { source: '/register', destination: '/studio/home?auth=register&next=%2Fonboarding', permanent: false },
    ];
  },
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
