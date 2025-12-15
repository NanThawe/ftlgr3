import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Lecture Companion',
  description: 'AI-powered learning companion for lecture transcripts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 min-h-screen text-white antialiased">
        {/* Background decorations */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/3 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl"></div>
        </div>
        <div className="relative">{children}</div>
      </body>
    </html>
  )
}
