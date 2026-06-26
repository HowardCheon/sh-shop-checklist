import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import PasswordGate from '@/components/PasswordGate'
import BottomNav from '@/components/BottomNav'

const font = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: '피부관리샵 창업 준비 체크리스트',
  description: '1인 예약제 피부관리샵 오픈을 위한 단계별 준비 체크리스트',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={font.className}>
        <PasswordGate>
          <div className="pb-10">{children}</div>
          <BottomNav />
        </PasswordGate>
      </body>
    </html>
  )
}
