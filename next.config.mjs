/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
};

export default nextConfig;
