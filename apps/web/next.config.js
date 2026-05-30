/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3002/api/v1/gateway/:path*',
      },
    ];
  },
};

export default nextConfig;
