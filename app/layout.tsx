import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR, Nanum_Myeongjo } from 'next/font/google'
import './globals.css'
import PasswordGate from '@/components/PasswordGate'
import BottomNav from '@/components/BottomNav'

const font = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
})

const serif = Nanum_Myeongjo({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  display: 'swap',
  variable: '--font-serif-kr',
})

export const metadata: Metadata = {
  title: '온:플로우 에스테틱 예약 관리',
  description: '온:플로우 에스테틱 1인 예약제 샵 예약·고객·시술 관리',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={serif.variable}>
      <body className={font.className}>
        <PasswordGate>
          <div className="pb-10">{children}</div>
          <BottomNav />
        </PasswordGate>
      </body>
    </html>
  )
}
