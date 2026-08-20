/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // PGlite ships a WASM bundle that must not be traced into the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
}

export default nextConfig
