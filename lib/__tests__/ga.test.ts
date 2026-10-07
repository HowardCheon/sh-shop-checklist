import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { serviceAccountJwt, parseDailyReport, pageLabel, dailyReportRequest, channelOf, cityLabel } from '../ga'

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
  it('하루 날짜로 기기·채널·페이지·신규/내부·도시 5개 리포트 (batch 최대 5)', () => {
    const body = dailyReportRequest('2026-10-06')
    expect(body.requests).toHaveLength(5)
    for (const r of body.requests) expect(r.dateRanges).toEqual([{ startDate: '2026-10-06', endDate: '2026-10-06' }])
    expect(body.requests.map(r => r.dimensions.map(d => d.name))).toEqual([
      ['deviceCategory'], ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'], ['pagePath'],
      ['newVsReturning', 'testDataFilterName'], ['city'],
    ])
  })
  it('내부 구분을 못 쓰면(필터 없음) 신규/재방문만', () => {
    const body = dailyReportRequest('2026-10-06', { internal: false })
    expect(body.requests[3].dimensions.map(d => d.name)).toEqual(['newVsReturning'])
  })
})

describe('이름 정리', () => {
  it('유입 채널 묶음', () => {
    expect(channelOf('Direct', '(direct)', '(none)')).toEqual({ group: '직접' })
    expect(channelOf('Organic Search', 'naver', 'organic')).toEqual({ group: '검색', part: '네이버' })
    expect(channelOf('Organic Search', 'google', 'organic')).toEqual({ group: '검색', part: '구글' })
    expect(channelOf('Organic Social', 'l.instagram.com', 'referral')).toEqual({ group: 'SNS', part: '인스타그램' })
    expect(channelOf('Unassigned', 'instagram', 'profile')).toEqual({ group: 'SNS', part: '인스타그램' }) // 공유 링크 출처 표시 우선
    expect(channelOf('Referral', 'kakao', 'share')).toEqual({ group: '카카오톡' })
    expect(channelOf('Unassigned', 'tv', 'qr')).toEqual({ group: 'TV QR' })
    expect(channelOf('Unassigned', 'naver_place', 'listing')).toEqual({ group: '네이버 플레이스' })
    expect(channelOf('Referral', 'blog.example.com', 'referral')).toEqual({ group: '링크', part: 'blog.example.com' })
    expect(channelOf('Unassigned', '(not set)', '(not set)')).toEqual({ group: '경로 불명' })
    expect(channelOf('(data not available)', '(data not available)', '')).toEqual({ group: '경로 불명' })
  })
  it('도시', () => {
    expect(cityLabel('Seoul')).toBe('서울')
    expect(cityLabel('Hanam-si')).toBe('하남')
    expect(cityLabel('Seongnam-si')).toBe('성남')
    expect(cityLabel('(not set)')).toBe('알 수 없음')
    expect(cityLabel('Busan')).toBe('부산')
    expect(cityLabel('Tokyo')).toBe('Tokyo')
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

const row = (dims: string | string[], ...metrics: number[]) => ({
  dimensionValues: (Array.isArray(dims) ? dims : [dims]).map(value => ({ value })),
  metricValues: metrics.map(m => ({ value: String(m) })),
})

describe('GA 응답 해석', () => {
  const reports = [
    { rows: [row('mobile', 10, 30), row('desktop', 2, 10)], totals: [{ metricValues: [{ value: '12' }, { value: '40' }] }] },
    { rows: [
      row(['Direct', '(direct)', '(none)'], 5),
      row(['Organic Search', 'naver', 'organic'], 2), row(['Organic Search', 'google', 'organic'], 1),
      row(['Unassigned', '(not set)', '(not set)'], 3), row(['Unassigned', 'tv', 'qr'], 1),
      row(['Organic Social', 'l.instagram.com', 'referral'], 1),
    ] },
    { rows: [row('/', 20), row('/booking', 9)] },
    { rows: [row(['new', ''], 4), row(['returning', ''], 1), row(['new', 'Internal Traffic'], 5), row(['returning', 'Internal Traffic'], 2)] },
    { rows: [row('Hanam-si', 6), row('Seoul', 4), row('(not set)', 2)] },
  ]
  it('내부/손님·신규/재방문·채널 묶음·도시', () => {
    const r = parseDailyReport({ reports })
    expect(r.users).toBe(12)
    expect(r.views).toBe(40)
    expect(r.mobileShare).toBe(83)
    expect(r.internal).toBe(7)
    expect(r.guestsNew).toBe(4)
    expect(r.guestsReturning).toBe(1)
    expect(r.channels).toEqual([
      { label: '직접', count: 5, parts: [] },
      { label: '검색', count: 3, parts: [{ label: '네이버', count: 2 }, { label: '구글', count: 1 }] },
      { label: '경로 불명', count: 3, parts: [] },
      { label: 'TV QR', count: 1, parts: [] },
      { label: 'SNS', count: 1, parts: [{ label: '인스타그램', count: 1 }] },
    ])
    expect(r.cities).toEqual([{ label: '하남', count: 6 }, { label: '서울', count: 4 }, { label: '알 수 없음', count: 2 }])
    expect(r.pages).toEqual([{ label: '홈', count: 20 }, { label: '예약', count: 9 }])
  })
  it('내부 구분 없이 조회한 경우(internal null) 신규/재방문은 전체 기준', () => {
    const r = parseDailyReport({ reports: [reports[0], reports[1], reports[2], { rows: [row('new', 10), row('returning', 2)] }, reports[4]] }, { internal: false })
    expect(r.internal).toBeNull()
    expect(r.guestsNew).toBe(10)
    expect(r.guestsReturning).toBe(2)
  })
  it('방문이 없으면 rows 없이 와도 0', () => {
    const r = parseDailyReport({ reports: [{}, {}, {}, {}, {}] })
    expect(r).toEqual({ users: 0, views: 0, mobileShare: 0, internal: 0, guestsNew: 0, guestsReturning: 0, channels: [], cities: [], pages: [] })
  })
})
