import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken, verifyPin } from '@/lib/auth'

/* 로그인 실패 제한 — IP별 10분에 5회 (인스턴스 메모리 기준 간이 제한) */
const WINDOW_MS = 10 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map<string, { count: number; since: number }>()

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const now = Date.now()
  const record = fails.get(ip)
  if (record && now - record.since < WINDOW_MS && record.count >= MAX_FAILS) {
    return NextResponse.json({ error: '시도 횟수를 초과했습니다. 10분 후 다시 시도하세요' }, { status: 429 })
  }

  const { pin } = await req.json().catch(() => ({}))
  if (!verifyPin(pin)) {
    const next = record && now - record.since < WINDOW_MS ? { count: record.count + 1, since: record.since } : { count: 1, since: now }
    fails.set(ip, next)
    return NextResponse.json({ error: 'PIN 번호가 올바르지 않습니다' }, { status: 401 })
  }

  fails.delete(ip)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, createSessionToken(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  })
  return res
}
