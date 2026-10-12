/** @type {import('next').NextConfig} */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

const nextConfig = {
  output: 'standalone',
  basePath,
};

export default nextConfig;
