import { BookingError } from './errors'

/** 선불 충전 금액별 보너스 */
export const CHARGE_TIERS = [
  { amount: 500000, bonus: 0 },
  { amount: 1000000, bonus: 100000 },
  { amount: 2000000, bonus: 250000 },
] as const

export function bonusFor(amount: number): number {
  const tier = CHARGE_TIERS.find(t => t.amount === amount)
  if (!tier) throw new BookingError('INVALID_INPUT', '충전 금액은 50만/100만/200만원만 가능합니다.')
  return tier.bonus
}

/** 직접 입력 충전 — 금액 1원 이상, 보너스 0 이상 정수 */
export function validateCustomCharge(amount: unknown, bonus: unknown) {
  // 숫자 또는 숫자로만 된 문자열만 허용 (true·[5]·'0x10'·'1e3' 등 거부)
  const toInt = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN)
  const a = toInt(amount)
  const b = bonus === undefined || bonus === null || bonus === '' ? 0 : toInt(bonus)
  if (!Number.isInteger(a) || a < 1) throw new BookingError('INVALID_INPUT', '충전 금액을 1원 이상 정수로 입력하세요.')
  if (!Number.isInteger(b) || b < 0) throw new BookingError('INVALID_INPUT', '보너스는 0원 이상 정수로 입력하세요.')
  return { amount: a, bonus: b }
}

/**
 * 선불 차감 분배 — 차감 시점 잔액 비율(실제:보너스), 보너스 몫 내림.
 * DB 함수 sh_shop_pay 와 같은 공식 (결제창 미리보기용)
 */
export function splitDeduction(amount: number, cash: number, bonus: number) {
  const total = cash + bonus
  const use = Math.min(amount, total)
  if (use <= 0) return { cash: 0, bonus: 0, other: amount }
  const bonusPart = use === total ? bonus : Math.floor((use * bonus) / total)
  return { cash: use - bonusPart, bonus: bonusPart, other: amount - use }
}

/** 선불충전금(실제+보너스) 잔액이 있으면 회원 */
export function isMember(customer: { prepaid_cash: number | null; prepaid_bonus: number | null } | null | undefined): boolean {
  if (!customer) return false
  return (customer.prepaid_cash ?? 0) + (customer.prepaid_bonus ?? 0) > 0
}
