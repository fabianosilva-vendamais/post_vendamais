/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() { return [{ source: '/api/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type, apikey' }] }]; },
  async rewrites() { return [{ source: '/app', destination: '/app/index.html' }]; }
};
export default nextConfig;
