import type { Metadata } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import "gridstack/dist/gridstack.min.css"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Regular.woff2",
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "SIGDATA | Inteligência em saúde pública",
  description: "Plataforma de monitoramento e análise de dados do SUS",
  other: {
    google: "notranslate",
  },
  icons: {
    icon: "/logo_site.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetbrainsMono.variable} notranslate`}
      translate="no"
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        <link rel="stylesheet" href="/leaflet/leaflet.css" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
