/* Google Analytics(GA4) 일일 접속 통계 (GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_JSON) — 내부/손님, 유입 채널, 지역 포함
 * 서비스 계정 JWT → 액세스 토큰 → Data API batchRunReports. 외부 라이브러리 없이 node:crypto 로 서명 */
import { createSign } from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOP_CHANNELS = 5
const TOP_PAGES = 5
const TOP_CITIES = 4

type ServiceAccount = { client_email: string; private_key: string }
export type Ranked = { label: string; count: number }
export type Channel = Ranked & { parts: Ranked[] }
export type DailyReport = {
  users: number
  views: number
  mobileShare: number
  /** 내부(매장·관리자 기기) 방문자 수 — 내부 구분을 못 하면 null */
  internal: number | null
  /** 손님(내부 제외) 신규·재방문 — 내부 구분을 못 하면 전체 기준 */
  guestsNew: number
  guestsReturning: number
  channels: Channel[]
  cities: Ranked[]
  pages: Ranked[]
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url')

export function serviceAccountJwt(sa: ServiceAccount, nowSec: number) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key)
  return `${head}.${claims}.${b64url(sig)}`
}

/** 하루(YYYY-MM-DD, 속성 시간대 기준) 기기·유입 채널·페이지·신규/내부·도시 — batchRunReports 최대 5개 */
export function dailyReportRequest(date: string, opts: { internal?: boolean } = {}) {
  const dateRanges = [{ startDate: date, endDate: date }]
  const top = (metricName: string) => ({ orderBys: [{ metric: { metricName }, desc: true }], limit: 50 })
  const dims = (...names: string[]) => names.map(name => ({ name }))
  return {
    requests: [
      { dateRanges, dimensions: dims('deviceCategory'), metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], metricAggregations: ['TOTAL'] },
      { dateRanges, dimensions: dims('sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'), metrics: [{ name: 'sessions' }], ...top('sessions') },
      { dateRanges, dimensions: dims('pagePath'), metrics: [{ name: 'screenPageViews' }], ...top('screenPageViews') },
      // 내부 트래픽(traffic_type=internal)은 GA 기본 데이터 필터 'Internal Traffic'(테스트 상태)로 구분
      { dateRanges, dimensions: opts.internal === false ? dims('newVsReturning') : dims('newVsReturning', 'testDataFilterName'), metrics: [{ name: 'activeUsers' }] },
      { dateRanges, dimensions: dims('city'), metrics: [{ name: 'activeUsers' }], ...top('activeUsers') },
    ],
  }
}

const SEARCH: [RegExp, string][] = [[/naver/, '네이버'], [/google/, '구글'], [/daum/, '다음'], [/bing/, '빙'], [/yahoo/, '야후']]
const SOCIAL: [RegExp, string][] = [[/instagram/, '인스타그램'], [/facebook/, '페이스북'], [/threads/, '스레드'], [/youtube/, '유튜브'], [/blog\.naver/, '네이버 블로그']]

/** 유입 채널 묶음 — 공유 링크의 출처 표시(utm_source)를 GA 채널 분류보다 우선 */
export function channelOf(group: string, source: string, medium: string): { group: string; part?: string } {
  const s = (source || '').toLowerCase()
  if (s === 'tv') return { group: 'TV QR' }
  if (/kakao/.test(s)) return { group: '카카오톡' }
  if (s === 'naver_place' || /place\.naver|map\.naver/.test(s)) return { group: '네이버 플레이스' }
  const social = SOCIAL.find(([re]) => re.test(s))
  if (social) return { group: 'SNS', part: social[1] }
  if (group === 'Direct' || s === '(direct)') return { group: '직접' }
  if (/Search/.test(group)) return { group: '검색', part: SEARCH.find(([re]) => re.test(s))?.[1] ?? source }
  if (/Social/.test(group)) return { group: 'SNS', part: source }
  if (group === 'Referral' && s && !s.startsWith('(')) return { group: '링크', part: source }
  if (!s || s.startsWith('(') || group === 'Unassigned' || group.startsWith('(')) return { group: '경로 불명' }
  return { group: '기타', part: `${source}${medium ? `/${medium}` : ''}` }
}

const CITIES: Record<string, string> = {
  seoul: '서울', hanam: '하남', seongnam: '성남', guri: '구리', namyangju: '남양주', gwangju: '광주', incheon: '인천',
  suwon: '수원', yongin: '용인', goyang: '고양', bucheon: '부천', anyang: '안양', busan: '부산', daegu: '대구',
  daejeon: '대전', ulsan: '울산', sejong: '세종', hwaseong: '화성', pyeongtaek: '평택', uijeongbu: '의정부', yangpyeong: '양평',
  gwangmyeong: '광명', gimpo: '김포', siheung: '시흥', ansan: '안산', gunpo: '군포', uiwang: '의왕', gwacheon: '과천',
  paju: '파주', yangju: '양주', icheon: '이천', osan: '오산', anseong: '안성', yeoju: '여주', gapyeong: '가평',
}

export function cityLabel(city: string) {
  if (!city || city.startsWith('(')) return '알 수 없음'
  const key = city.toLowerCase().replace(/[-\s](si|gun|gu)$/, '')
  return CITIES[key] ?? city
}

const PAGES: Record<string, string> = {
  '/': '홈',
  '/index': '홈',
  '/booking': '예약',
  '/care/rose-detox': '로즈 해독',
  '/care/back-care': '등 케어',
  '/care/belly-care': '복부 케어',
  '/care/basic-care': '베이직',
  '/care/signature-care': '시그니처',
  '/care/plasma-care': '플라즈마',
  '/care/cell-youth': '셀유스',
  '/care/peptide-care': '펩타이드',
}

export function pageLabel(path: string) {
  const p = path.replace(/\.html$/, '').replace(/(.)\/$/, '$1')
  return PAGES[p] ?? path
}

type GaRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
type GaReport = { rows?: GaRow[]; totals?: GaRow[] }

const num = (v: string | undefined) => Number(v) || 0
const dim = (r: GaRow, i: number) => r.dimensionValues?.[i]?.value ?? ''
const metric = (r: GaRow) => num(r.metricValues?.[0]?.value)

/** 같은 이름끼리 합쳐 많은 순 상위 n개 */
function rank(rows: GaRow[] | undefined, label: (v: string) => string, n: number): Ranked[] {
  const sum = new Map<string, number>()
  for (const r of rows ?? []) {
    const key = label(dim(r, 0))
    sum.set(key, (sum.get(key) ?? 0) + metric(r))
  }
  return [...sum].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count).slice(0, n)
}

/** 채널별 합계 + 세부(검색엔진·SNS 이름 등) */
function channels(rows: GaRow[] | undefined): Channel[] {
  const groups = new Map<string, { count: number; parts: Map<string, number> }>()
  for (const r of rows ?? []) {
    const c = channelOf(dim(r, 0), dim(r, 1), dim(r, 2))
    const g = groups.get(c.group) ?? { count: 0, parts: new Map<string, number>() }
    g.count += metric(r)
    if (c.part) g.parts.set(c.part, (g.parts.get(c.part) ?? 0) + metric(r))
    groups.set(c.group, g)
  }
  return [...groups]
    .map(([label, g]) => ({ label, count: g.count, parts: [...g.parts].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_CHANNELS)
}

export function parseDailyReport(data: { reports?: GaReport[] }, opts: { internal?: boolean } = {}): DailyReport {
  const [device, source, page, visitors, city] = data.reports ?? []
  const total = device?.totals?.[0]?.metricValues ?? []
  const users = num(total[0]?.value)
  const mobile = (device?.rows ?? []).find(r => dim(r, 0) === 'mobile')

  // 내부 = 'Internal Traffic' 필터에 걸린 방문자, 손님 신규/재방문은 그 외
  const withInternal = opts.internal !== false
  let internal = 0
  let guestsNew = 0
  let guestsReturning = 0
  for (const r of visitors?.rows ?? []) {
    if (withInternal && /internal/i.test(dim(r, 1))) { internal += metric(r); continue }
    if (dim(r, 0) === 'new') guestsNew += metric(r)
    else if (dim(r, 0) === 'returning') guestsReturning += metric(r)
  }

  return {
    users,
    views: num(total[1]?.value),
    mobileShare: users ? Math.round((num(mobile?.metricValues?.[0]?.value) / users) * 100) : 0,
    internal: withInternal ? internal : null,
    guestsNew,
    guestsReturning,
    channels: channels(source?.rows),
    cities: rank(city?.rows, cityLabel, TOP_CITIES),
    pages: rank(page?.rows, pageLabel, TOP_PAGES),
  }
}

export function gaConfigured() {
  return !!(process.env.GA_PROPERTY_ID && process.env.GA_SERVICE_ACCOUNT_JSON)
}

function apiError(status: number, data: unknown) {
  const d = data as { error?: { message?: string } | string; error_description?: string } | null
  const msg = typeof d?.error === 'object' ? d.error.message : d?.error_description ?? d?.error
  return msg ? `HTTP ${status} ${String(msg).slice(0, 120)}` : `HTTP ${status}`
}

/** 하루 접속 통계 조회 — 실패해도 throw 하지 않고 사유 반환 */
export async function fetchDailyReport(date: string): Promise<DailyReport | { error: string }> {
  const propertyId = process.env.GA_PROPERTY_ID
  const json = process.env.GA_SERVICE_ACCOUNT_JSON
  if (!propertyId || !json) return { error: 'GA 설정(GA_*) 없음' }
  try {
    const sa = JSON.parse(json) as ServiceAccount
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: serviceAccountJwt(sa, Math.floor(Date.now() / 1000)),
      }),
      signal: AbortSignal.timeout(10000),
    })
    const token = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !token?.access_token) return { error: `인증 ${apiError(tokenRes.status, token)}` }

    const run = async (internal: boolean) => {
      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dailyReportRequest(date, { internal })),
        signal: AbortSignal.timeout(15000),
      })
      return { res, data: await res.json().catch(() => null) }
    }
    let internal = true
    let { res, data } = await run(true)
    // 내부 구분 차원을 이 속성에서 쓸 수 없으면 내부 구분 없이 다시 조회
    if (res.status === 400 && /testDataFilterName/i.test(JSON.stringify(data))) {
      internal = false
      ;({ res, data } = await run(false))
    }
    if (!res.ok || !data) return { error: apiError(res.status, data) }
    return parseDailyReport(data, { internal })
  } catch (e) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류' }
  }
}
