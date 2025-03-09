/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
  images: {
    domains: ['book-finder-prod.s3.amazonaws.com'],
  },
};

export default nextConfig;
