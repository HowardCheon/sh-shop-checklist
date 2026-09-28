/* 예약 후 회원 여부가 바뀐 경우의 적용 가격 — 예정(scheduled) 예약만 현재 기준으로 다시 계산 */
import { isMember } from './prepaid'

type PriceType = 'member' | 'regular'

export type PricedReservation = {
  status: string
  price: number | null
  price_type?: string | null
  product?: { price: number; member_price: number | null } | null
  customer?: { prepaid_cash: number | null; prepaid_bonus: number | null } | null
}

export type EffectivePrice = {
  price: number | null
  /** to_member: 비회원 예약 → 회원가, to_regular: 회원 예약 → 비회원가 */
  changed: 'to_member' | 'to_regular' | null
  bookedPrice: number | null
}

function priceOf(product: NonNullable<PricedReservation['product']>, type: PriceType) {
  return type === 'member' ? product.member_price ?? product.price : product.price
}

/** 예약 당시 구분 — 저장값이 없으면(관리자 등록) 금액이 회원가/비회원가 중 무엇인지로 추정 */
function bookedType(r: PricedReservation): PriceType | null {
  if (r.price_type === 'member' || r.price_type === 'regular') return r.price_type
  if (!r.product || r.price == null) return null
  if (r.price === r.product.member_price) return 'member'
  if (r.price === r.product.price) return 'regular'
  return null
}

export function effectivePrice(r: PricedReservation): EffectivePrice {
  const same = { price: r.price, changed: null, bookedPrice: r.price }
  if (r.status !== 'scheduled' || !r.product) return same

  const booked = bookedType(r)
  if (!booked) return same
  const now: PriceType = isMember(r.customer ?? null) ? 'member' : 'regular'
  const price = priceOf(r.product, now)
  if (booked === now || price === r.price) return same

  return { price, changed: now === 'member' ? 'to_member' : 'to_regular', bookedPrice: r.price }
}
