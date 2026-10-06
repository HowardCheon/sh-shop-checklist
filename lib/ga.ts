/* Google Analytics(GA4) 일일 접속 통계 (GA_PROPERTY_ID, GA_SERVICE_ACCOUNT_JSON)
 * 서비스 계정 JWT → 액세스 토큰 → Data API batchRunReports. 외부 라이브러리 없이 node:crypto 로 서명 */
import { createSign } from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TOP_SOURCES = 4
const TOP_PAGES = 5

type ServiceAccount = { client_email: string; private_key: string }
export type Ranked = { label: string; count: number }
export type DailyReport = { users: number; views: number; mobileShare: number; sources: Ranked[]; pages: Ranked[] }

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url')

export function serviceAccountJwt(sa: ServiceAccount, nowSec: number) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key)
  return `${head}.${claims}.${b64url(sig)}`
}

/** 하루(YYYY-MM-DD, 속성 시간대 기준) 기기별 방문·유입 경로·페이지 */
export function dailyReportRequest(date: string) {
  const dateRanges = [{ startDate: date, endDate: date }]
  const top = (metricName: string) => ({ orderBys: [{ metric: { metricName }, desc: true }], limit: 50 })
  return {
    requests: [
      { dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], metricAggregations: ['TOTAL'] },
      { dateRanges, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], ...top('sessions') },
      { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], ...top('screenPageViews') },
    ],
  }
}

const SOURCES: [RegExp, string][] = [
  [/^\(direct\)$/, '직접'],
  [/naver/, '네이버'],
  [/instagram/, '인스타그램'],
  [/google/, '구글'],
  [/daum/, '다음'],
  [/kakao/, '카카오'],
  [/facebook/, '페이스북'],
  [/^\(not set\)$/, '기타'],
]

export function sourceLabel(source: string) {
  const s = source.toLowerCase()
  return SOURCES.find(([re]) => re.test(s))?.[1] ?? source
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

/** 같은 이름끼리 합쳐 많은 순 상위 n개 */
function rank(rows: GaRow[] | undefined, label: (v: string) => string, n: number): Ranked[] {
  const sum = new Map<string, number>()
  for (const r of rows ?? []) {
    const key = label(r.dimensionValues?.[0]?.value ?? '')
    sum.set(key, (sum.get(key) ?? 0) + num(r.metricValues?.[0]?.value))
  }
  return [...sum].map(([l, count]) => ({ label: l, count })).sort((a, b) => b.count - a.count).slice(0, n)
}

export function parseDailyReport(data: { reports?: GaReport[] }): DailyReport {
  const [device, source, page] = data.reports ?? []
  const total = device?.totals?.[0]?.metricValues ?? []
  const users = num(total[0]?.value)
  const mobile = (device?.rows ?? []).find(r => r.dimensionValues?.[0]?.value === 'mobile')
  return {
    users,
    views: num(total[1]?.value),
    mobileShare: users ? Math.round((num(mobile?.metricValues?.[0]?.value) / users) * 100) : 0,
    sources: rank(source?.rows, sourceLabel, TOP_SOURCES),
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

    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dailyReportRequest(date)),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return { error: apiError(res.status, data) }
    return parseDailyReport(data)
  } catch (e) {
    return { error: e instanceof Error ? e.message : '알 수 없는 오류' }
  }
}
