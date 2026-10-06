/* 관리자 앱 보안 응답 헤더 — next.config.ts 에서 모든 경로에 적용 */

export function securityHeaders(isDev: boolean) {
  // Next.js 인라인 부트스트랩 스크립트 때문에 script-src 'unsafe-inline' 필요 (nonce 방식은 정적 렌더링을 포기해야 함)
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
    "img-src 'self' blob: data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'", // 도면 페이지가 같은 사이트의 HTML 을 iframe 으로 띄움
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ]
}
