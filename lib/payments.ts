/* 결제 / 선불충전금 — 금액 변경은 모두 DB 함수(트랜잭션 + 행 잠금)로 처리 */
import { supabase } from '@/lib/supabase'
import { recordCustomerHistory } from '@/lib/booking/admin'

export type PaymentMethod = 'card' | 'cash' | 'transfer'

export const METHOD_LABEL: Record<PaymentMethod, string> = { card: '카드', cash: '현금', transfer: '계좌이체' }

const RPC_ERRORS: Record<string, [number, string]> = {
  INVALID_AMOUNT: [400, '금액이 올바르지 않습니다'],
  CUSTOMER_NOT_FOUND: [404, '고객을 찾을 수 없습니다'],
  OTHER_METHOD_REQUIRED: [400, '선불 잔액이 부족합니다. 부족분 결제수단을 선택하세요'],
  PAYMENT_NOT_FOUND: [404, '결제를 찾을 수 없습니다'],
  ALREADY_VOIDED: [409, '이미 취소된 결제입니다'],
  NO_BALANCE: [409, '환불할 잔액이 없습니다'],
  ALREADY_REGISTERED: [409, '이미 첫체험 패키지가 등록된 고객입니다'],
  NO_REMAINING: [409, '남은 횟수가 없습니다'],
  PACKAGE_NOT_FOUND: [404, '첫체험 패키지를 찾을 수 없습니다'],
  PACKAGE_CANCELLED: [409, '취소된 첫체험 패키지입니다'],
  USE_NOT_FOUND: [404, '사용 내역을 찾을 수 없습니다'],
  ALREADY_CANCELLED: [409, '이미 취소되었습니다'],
  HAS_USES: [409, '사용 내역이 있어 등록을 취소할 수 없습니다. 사용을 먼저 취소하세요'],
  INVALID_TRIAL_USE: [400, '사용 종류가 올바르지 않습니다'],
}

export class PaymentError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    const code = Object.keys(RPC_ERRORS).find(k => error.message?.includes(k))
    if (code) throw new PaymentError(...RPC_ERRORS[code])
    console.error(`${fn} 실패`, error)
    throw new PaymentError(500, '처리에 실패했습니다')
  }
  return data as T
}

const won = (n: number) => `${n.toLocaleString()}원`

export type Payment = {
  id: number
  customer_id: number | null
  reservation_id: number | null
  total_amount: number
  prepaid_cash_used: number
  prepaid_bonus_used: number
  other_method: PaymentMethod | null
  other_amount: number
  status: 'paid' | 'voided'
  memo: string | null
  created_at: string
}

export function describePayment(p: Payment) {
  const parts: string[] = []
  if (p.prepaid_cash_used + p.prepaid_bonus_used > 0) {
    parts.push(`선불 ${won(p.prepaid_cash_used + p.prepaid_bonus_used)}(실제 ${won(p.prepaid_cash_used)}·보너스 ${won(p.prepaid_bonus_used)})`)
  }
  if (p.other_amount > 0 && p.other_method) parts.push(`${METHOD_LABEL[p.other_method]} ${won(p.other_amount)}`)
  return `${won(p.total_amount)} 결제${parts.length ? ` — ${parts.join(' + ')}` : ''}`
}

export async function charge(customerId: number, amount: number, bonus: number, memo: string | null) {
  const customer = await rpc<{ id: number; prepaid_cash: number; prepaid_bonus: number }>('sh_shop_prepaid_charge', {
    p_customer_id: customerId, p_amount: amount, p_bonus: bonus, p_memo: memo,
  })
  await recordCustomerHistory(customerId, {
    action: 'prepaid_charged',
    description: `선불 충전 ${won(amount)}${bonus ? ` + 보너스 ${won(bonus)}` : ''}${memo ? ` (${memo})` : ''}`,
    new_value: { prepaid_cash: customer.prepaid_cash, prepaid_bonus: customer.prepaid_bonus },
  })
  return customer
}

export async function pay(params: {
  customerId: number | null
  reservationId: number | null
  amount: number
  usePrepaid: boolean
  otherMethod: PaymentMethod | null
  memo: string | null
}) {
  if (params.usePrepaid && !params.customerId) throw new PaymentError(400, '고객이 연결되지 않은 예약은 선불을 사용할 수 없습니다')
  const payment = await rpc<Payment>('sh_shop_pay', {
    p_customer_id: params.customerId,
    p_reservation_id: params.reservationId,
    p_amount: params.amount,
    p_use_prepaid: params.usePrepaid,
    p_other_method: params.otherMethod,
    p_memo: params.memo,
  })
  await recordCustomerHistory(params.customerId, {
    reservation_id: params.reservationId,
    action: 'payment',
    description: `${params.reservationId ? '시술' : '직접 차감'} ${describePayment(payment)}${params.memo ? ` (${params.memo})` : ''}`,
    new_value: payment,
  })
  return payment
}

export async function voidPayment(paymentId: number) {
  const payment = await rpc<Payment>('sh_shop_payment_void', { p_payment_id: paymentId })
  await recordCustomerHistory(payment.customer_id, {
    reservation_id: payment.reservation_id,
    action: 'payment_voided',
    description: `결제 취소 — ${describePayment(payment)}`,
    old_value: payment,
  })
  return payment
}

/** 예약의 유효 결제를 모두 취소 (완료 → 취소/복원 시) */
export async function voidReservationPayments(reservationId: number) {
  const { data } = await supabase.from('sh_shop_payments').select('id').eq('reservation_id', reservationId).eq('status', 'paid')
  let count = 0
  for (const p of data ?? []) {
    try {
      await voidPayment(p.id)
      count++
    } catch (e) {
      if (!(e instanceof PaymentError && e.status === 409)) throw e // 이미 취소됨은 무시
    }
  }
  return count
}

export async function refund(customerId: number, memo: string | null) {
  const result = await rpc<{ refund_amount: number; bonus_forfeited: number }>('sh_shop_prepaid_refund', {
    p_customer_id: customerId, p_memo: memo,
  })
  await recordCustomerHistory(customerId, {
    action: 'prepaid_refunded',
    description: `선불 환불 ${won(result.refund_amount)}${result.bonus_forfeited ? ` · 보너스 ${won(result.bonus_forfeited)} 소멸` : ''}${memo ? ` (${memo})` : ''}`,
    new_value: result,
  })
  return result
}

export function paymentErrorResponse(e: unknown) {
  if (e instanceof PaymentError) return { body: { error: e.message }, status: e.status }
  console.error('결제 처리 오류', e)
  return { body: { error: '처리에 실패했습니다' }, status: 500 }
}
