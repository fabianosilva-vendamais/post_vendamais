/** @type {import('next').NextConfig} */
const nextConfig = { async headers() { return [{ source: '/api/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Access-Control-Allow-Headers', value: 'authorization, content-type, apikey' }] }]; } };
export default nextConfig;
