import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../security-headers'

const get = (h: { key: string; value: string }[], key: string) => h.find(x => x.key === key)?.value ?? ''

describe('관리자 앱 보안 헤더', () => {
  const h = securityHeaders(false)
  it('클릭재킹 방지 — 같은 사이트(도면 iframe)만 허용', () => {
    expect(get(h, 'X-Frame-Options')).toBe('SAMEORIGIN')
    expect(get(h, 'Content-Security-Policy')).toContain("frame-ancestors 'self'")
  })
  it('CSP 기본 정책·외부 폰트 허용·플러그인 차단', () => {
    const csp = get(h, 'Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).not.toContain("'unsafe-eval'")
  })
  it('개발 모드만 unsafe-eval 허용 (HMR)', () => {
    expect(get(securityHeaders(true), 'Content-Security-Policy')).toContain("'unsafe-eval'")
  })
  it('기타 헤더', () => {
    expect(get(h, 'X-Content-Type-Options')).toBe('nosniff')
    expect(get(h, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(get(h, 'Strict-Transport-Security')).toContain('max-age=')
    expect(get(h, 'Permissions-Policy')).toContain('camera=()')
  })
})
