/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone image
  output: 'standalone',
  async rewrites() {
    // In Docker: API_GATEWAY_URL=http://api-gateway:3002 (container-to-container)
    // In local dev: falls back to localhost:3002
    const gatewayUrl = process.env.API_GATEWAY_URL ?? 'http://localhost:3002';
    return [
      {
        source: '/api/:path*',
        destination: `${gatewayUrl}/api/v1/gateway/:path*`,
      },
    ];
  },
};

export default nextConfig;
