import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Für Eigenbetrieb (VPS, Docker, Hostinger VPS): erzeugt einen
  // eigenstaendigen Server unter .next/standalone samt allen benoetigten
  // node_modules. Auf Vercel bleibt es aus, dort ist es unnoetig.
  //
  //   BUILD_STANDALONE=1 npm run build
  //   node .next/standalone/server.js
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
}

export default nextConfig
