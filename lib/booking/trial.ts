import { BookingError } from './errors'

export type TrialCode = 'trial2' | 'trial4'
export type TrialKind = 'basic' | 'special'

/** 첫체험 패키지 (홈페이지 오픈 이벤트 기준) */
export const TRIAL_PACKAGES: Record<TrialCode, { label: string; price: number; basic: number; special: number; months: number }> = {
  trial2: { label: '첫체험 2회', price: 99000, basic: 1, special: 1, months: 1 },
  trial4: { label: '첫체험 4회', price: 219000, basic: 1, special: 3, months: 3 },
}

export const SPECIAL_CARES = ['플라즈마', '로즈 해독', '상체', '하체'] as const

export interface TrialPackageRow {
  id: number
  customer_id: number | null
  package_code: string
  basic_total: number
  special_total: number
  basic_used: number
  special_used: number
  price: number
  payment_id: number | null
  expires_on: string
  status: 'active' | 'cancelled'
  created_at: string
  cancelled_at: string | null
}

export interface TrialUseRow {
  id: number
  package_id: number
  kind: TrialKind
  care_name: string | null
  status: 'used' | 'cancelled'
  memo: string | null
  created_at: string
  cancelled_at: string | null
}

export function trialPackage(code: unknown) {
  if (typeof code !== 'string' || !Object.hasOwn(TRIAL_PACKAGES, code)) {
    throw new BookingError('INVALID_INPUT', '첫체험 패키지 종류가 올바르지 않습니다.')
  }
  return { code: code as TrialCode, ...TRIAL_PACKAGES[code as TrialCode] }
}

export function validateUse(kind: unknown, careName: unknown): { kind: TrialKind; careName: string | null } {
  if (kind === 'basic') return { kind, careName: null }
  if (kind !== 'special') throw new BookingError('INVALID_INPUT', '사용 종류가 올바르지 않습니다.')
  if (typeof careName !== 'string' || !(SPECIAL_CARES as readonly string[]).includes(careName)) {
    throw new BookingError('INVALID_INPUT', '스페셜 케어 시술을 선택하세요.')
  }
  return { kind, careName }
}

/** 남은 횟수·만료 판정 — today, expires_on 은 'YYYY-MM-DD' (만료일 당일까지 유효) */
export function trialStatus(
  pkg: Pick<TrialPackageRow, 'basic_total' | 'special_total' | 'basic_used' | 'special_used' | 'expires_on'>,
  today: string,
) {
  const basicLeft = pkg.basic_total - pkg.basic_used
  const specialLeft = pkg.special_total - pkg.special_used
  const daysLeft = Math.round((Date.parse(pkg.expires_on) - Date.parse(today)) / 86400e3)
  return { basicLeft, specialLeft, daysLeft, expired: daysLeft < 0, done: basicLeft + specialLeft === 0 }
}

export const kstToday = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10)

/** 예약 리스트 배지 — 남은 횟수 없으면 null */
export function trialBadge(
  pkg: Pick<TrialPackageRow, 'basic_total' | 'special_total' | 'basic_used' | 'special_used' | 'expires_on'>,
  today: string,
) {
  const st = trialStatus(pkg, today)
  if (st.done) return null
  return { label: `첫체험 B${st.basicLeft}·S${st.specialLeft}`, expired: st.expired }
}

const CARE_KEYWORDS: [string, string][] = [['플라즈마', '플라즈마'], ['로즈', '로즈 해독'], ['상체', '상체'], ['하체', '하체']]

/** 예약 시술명으로 첫체험 차감 기본 선택 추정 */
export function defaultTrialChoice(productName: string | null): { kind: 'basic' } | { kind: 'special'; care: string } | null {
  if (!productName) return null
  if (productName.includes('베이직')) return { kind: 'basic' }
  const hit = CARE_KEYWORDS.find(([k]) => productName.includes(k))
  return hit ? { kind: 'special', care: hit[1] } : null
}
