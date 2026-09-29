import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/* 관리자 인증 — 공개 예약 API·로그인·정적 파일을 제외한 모든 페이지/API 보호 */
export function proxy(req: NextRequest) {
  if (verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  const login = new URL('/login', req.url)
  // 로그인 후 원래 가려던 곳으로 (알림 링크의 /?date=&open= 포함)
  if (pathname !== '/' || search) login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    // 확장자 예외는 /api 에는 적용하지 않음, /login 은 정확히 일치할 때만 제외
    '/((?!_next/|api/public/|api/auth/|api/cron/|login$|favicon\\.ico$|(?!api/).*\\.[a-zA-Z0-9]+$).*)',
  ],
}
