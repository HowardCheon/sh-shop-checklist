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

/** 선불충전금(실제+보너스) 잔액이 있으면 회원 */
export function isMember(customer: { prepaid_cash: number | null; prepaid_bonus: number | null } | null | undefined): boolean {
  if (!customer) return false
  return (customer.prepaid_cash ?? 0) + (customer.prepaid_bonus ?? 0) > 0
}
