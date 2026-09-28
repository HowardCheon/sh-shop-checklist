/* 관리자 세션 — HMAC 서명 쿠키 (proxy 와 로그인 API 에서 공용) */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'sh_admin'
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60 // 30일

function secret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET
  return s && s.length >= 32 ? s : null
}

function sign(payload: string, key: string) {
  return createHmac('sha256', key).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function createSessionToken(now = Date.now()): string {
  const key = secret()
  if (!key) throw new Error('ADMIN_SESSION_SECRET(32자 이상) 환경변수가 필요합니다')
  const expires = String(now + SESSION_MAX_AGE_SEC * 1000)
  return `${expires}.${sign(expires, key)}`
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret()
  if (!key || !token) return false
  const [expires, sig] = token.split('.')
  if (!expires || !sig || !/^\d+$/.test(expires) || Number(expires) < now) return false
  return safeEqual(sig, sign(expires, key))
}

export function verifyPin(pin: unknown): boolean {
  const expected = process.env.ADMIN_PIN
  return !!expected && typeof pin === 'string' && safeEqual(pin, expected)
}
