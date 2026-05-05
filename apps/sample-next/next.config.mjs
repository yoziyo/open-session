/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@open-session/sdk", "@open-session/protocol"],
};
export default nextConfig;
