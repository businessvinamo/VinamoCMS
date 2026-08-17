import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vinamo CMS',
  description: 'Inhalte pflegen für Kundenwebsites von vinamo.ch',
  icons: { icon: '/brand/svg/vinamo-favicon.svg' },
}

// Mobile-first: Die Wirtin ändert das Tagesmenü vom Handy.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF9' },
    { media: '(prefers-color-scheme: dark)', color: '#131327' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
