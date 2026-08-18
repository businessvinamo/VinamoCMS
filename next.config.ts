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

  /**
   * Sicherheitskopfzeilen.
   *
   * Beim Sicherheitsdurchgang fiel auf, dass admin.vinamo.ch weder
   * X-Frame-Options noch frame-ancestors setzt. Ein Adminportal, das sich in
   * einen fremden Rahmen setzen lässt, ist angreifbar: Der Kunde ist angemeldet,
   * sieht eine harmlose Seite und klickt in Wahrheit auf „Endgültig löschen".
   *
   * Bewusst OHNE script-src: Next.js liefert Inline-Skripte aus, eine strenge
   * Skript-Richtlinie bräuchte Nonces über die ganze Anwendung. frame-ancestors,
   * base-uri und form-action wirken sofort und brechen nichts.
   */
  async headers() {
    return [
      {
        source: '/:pfad*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Kamera, Mikrofon und Ortung braucht dieses Backend nirgends.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ]
  },
}

export default nextConfig
