import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google'
import './globals.css'

/**
 * Markenschriften laut brand/README.txt.
 *
 * next/font lädt sie beim Bauen herunter und liefert sie von der eigenen Domain
 * aus -- keine Anfrage an Google zur Laufzeit. Das ist hier nicht nur eine
 * Geschwindigkeitsfrage: Ein Aufruf von fonts.gstatic.com bei jedem Seitenaufruf
 * überträgt die IP-Adresse des Kunden in die USA und wäre für ein Werkzeug mit
 * Schweizer Kundendaten ein unnötiges DSGVO-Thema.
 */
const text = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-text',
  display: 'swap',
})

const wortmarke = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-wortmarke',
  display: 'swap',
})

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
    <html lang="de" className={`${text.variable} ${wortmarke.variable}`}>
      <body>{children}</body>
    </html>
  )
}
