import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { serviceAccountJwt, parseDailyReport, sourceLabel, pageLabel, dailyReportRequest } from '../ga'

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString())

describe('GA 서비스 계정 JWT', () => {
  it('RS256 서명, analytics.readonly 범위, 1시간 유효', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const jwt = serviceAccountJwt({ client_email: 'ga@x.iam.gserviceaccount.com', private_key: pem }, 1_800_000_000)
    const [h, p, sig] = jwt.split('.')
    expect(b64json(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(b64json(p)).toEqual({
      iss: 'ga@x.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    })
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, 'base64url'))
    expect(ok).toBe(true)
  })
})

describe('GA 리포트 요청', () => {
  it('하루 날짜로 기기·유입·페이지 3개 리포트', () => {
    const body = dailyReportRequest('2026-10-06')
    expect(body.requests).toHaveLength(3)
    for (const r of body.requests) expect(r.dateRanges).toEqual([{ startDate: '2026-10-06', endDate: '2026-10-06' }])
    expect(body.requests.map(r => r.dimensions[0].name)).toEqual(['deviceCategory', 'sessionSource', 'pagePath'])
  })
})

describe('이름 정리', () => {
  it('유입 경로', () => {
    expect(sourceLabel('(direct)')).toBe('직접')
    expect(sourceLabel('m.search.naver.com')).toBe('네이버')
    expect(sourceLabel('l.instagram.com')).toBe('인스타그램')
    expect(sourceLabel('google')).toBe('구글')
    expect(sourceLabel('m.blog.daum.net')).toBe('다음')
    expect(sourceLabel('(not set)')).toBe('기타')
    expect(sourceLabel('example.com')).toBe('example.com')
  })
  it('페이지', () => {
    expect(pageLabel('/')).toBe('홈')
    expect(pageLabel('/index.html')).toBe('홈')
    expect(pageLabel('/booking')).toBe('예약')
    expect(pageLabel('/booking.html')).toBe('예약')
    expect(pageLabel('/care/rose-detox')).toBe('로즈 해독')
    expect(pageLabel('/care/signature-care/')).toBe('시그니처')
    expect(pageLabel('/unknown')).toBe('/unknown')
  })
})

const row = (dim: string, ...metrics: number[]) => ({
  dimensionValues: [{ value: dim }],
  metricValues: metrics.map(m => ({ value: String(m) })),
})

describe('GA 응답 해석', () => {
  it('합계·모바일 비율·유입/페이지 묶어서 상위만', () => {
    const report = parseDailyReport({
      reports: [
        { rows: [row('mobile', 20, 50), row('desktop', 3, 11)], totals: [{ metricValues: [{ value: '23' }, { value: '61' }] }] },
        { rows: [row('m.search.naver.com', 8), row('search.naver.com', 4), row('l.instagram.com', 6), row('(direct)', 5), row('google', 2), row('daum.net', 1)] },
        { rows: [row('/', 23), row('/booking', 9), row('/care/rose-detox', 6), row('/index.html', 2), row('/care/signature-care', 4), row('/care/plasma-care', 3), row('/care/back-care', 1)] },
      ],
    })
    expect(report.users).toBe(23)
    expect(report.views).toBe(61)
    expect(report.mobileShare).toBe(87) // 20/23
    expect(report.sources).toEqual([
      { label: '네이버', count: 12 }, { label: '인스타그램', count: 6 }, { label: '직접', count: 5 }, { label: '구글', count: 2 },
    ])
    expect(report.pages).toEqual([
      { label: '홈', count: 25 }, { label: '예약', count: 9 }, { label: '로즈 해독', count: 6 }, { label: '시그니처', count: 4 }, { label: '플라즈마', count: 3 },
    ])
  })
  it('방문이 없으면 rows 없이 와도 0', () => {
    const report = parseDailyReport({ reports: [{}, {}, {}] })
    expect(report).toEqual({ users: 0, views: 0, mobileShare: 0, sources: [], pages: [] })
  })
})
