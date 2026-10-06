/* 첫체험 패키지 — 등록·사용·취소는 DB 함수(트랜잭션 + 행 잠금), 고객 이력 기록 */
import { supabase } from '@/lib/supabase'
import { recordCustomerHistory } from '@/lib/booking/admin'
import { TRIAL_PACKAGES, kstToday, trialBadge, type TrialCode, type TrialKind, type TrialPackageRow, type TrialUseRow } from '@/lib/booking/trial'
import { PaymentError, describePayment, rpc, type Payment, type PaymentMethod } from '@/lib/payments'

const pkgLabel = (p: TrialPackageRow) => TRIAL_PACKAGES[p.package_code as TrialCode]?.label ?? p.package_code
const useLabel = (u: TrialUseRow) => (u.kind === 'basic' ? '베이직' : `스페셜 - ${u.care_name}`)
const remain = (p: TrialPackageRow) => `남은 베이직 ${p.basic_total - p.basic_used} · 스페셜 ${p.special_total - p.special_used}`

export async function registerTrial(customerId: number, code: TrialCode, usePrepaid: boolean, otherMethod: PaymentMethod | null, price?: number) {
  const def = { ...TRIAL_PACKAGES[code], ...(price !== undefined ? { price } : {}) }
  const result = await rpc<{ package: TrialPackageRow; payment: Payment }>('sh_shop_trial_register', {
    p_customer_id: customerId, p_code: code, p_price: def.price, p_basic: def.basic, p_special: def.special,
    p_months: def.months, p_use_prepaid: usePrepaid, p_other_method: otherMethod, p_memo: `${def.label} 패키지`,
  })
  await recordCustomerHistory(customerId, {
    action: 'trial_registered',
    description: `${def.label} 등록 · ${describePayment(result.payment)} · ${result.package.expires_on}까지`,
    new_value: result,
  })
  return result
}

export async function useTrial(packageId: number, kind: TrialKind, careName: string | null, memo: string | null, reservationId: number | null = null) {
  const result = await rpc<{ use: TrialUseRow; package: TrialPackageRow }>('sh_shop_trial_use', {
    p_package_id: packageId, p_kind: kind, p_care_name: careName, p_memo: memo, p_reservation_id: reservationId,
  })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_used',
    reservation_id: reservationId,
    description: `${pkgLabel(result.package)} ${useLabel(result.use)} 사용${reservationId ? ' (시술 완료)' : ''} (${remain(result.package)})${memo ? ` · ${memo}` : ''}`,
    new_value: result.use,
  })
  return result
}

export async function cancelTrialUse(useId: number) {
  const result = await rpc<{ use: TrialUseRow; package: TrialPackageRow }>('sh_shop_trial_use_cancel', { p_use_id: useId })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_use_cancelled',
    description: `${pkgLabel(result.package)} ${useLabel(result.use)} 사용 취소 (${remain(result.package)})`,
    old_value: result.use,
  })
  return result
}

export async function cancelTrial(packageId: number) {
  const result = await rpc<{ package: TrialPackageRow; payment: Payment | null }>('sh_shop_trial_cancel', { p_package_id: packageId })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_cancelled',
    description: `${pkgLabel(result.package)} 등록 취소${result.payment ? ` — 결제 취소 ${describePayment(result.payment)}` : ''}`,
    old_value: result,
  })
  return result
}

export const trialUseLabel = useLabel

/** 예약에 연결된 첫체험 사용을 모두 취소 (완료 예약 취소·복원, 결제 취소 시) — 취소 건수 */
export async function cancelReservationTrialUses(reservationId: number) {
  const { data, error } = await supabase.from('sh_shop_trial_uses').select('id').eq('reservation_id', reservationId).eq('status', 'used')
  if (error) throw error
  let count = 0
  for (const u of data ?? []) {
    try {
      await cancelTrialUse(u.id)
      count++
    } catch (e) {
      if (!(e instanceof PaymentError && e.code === 'ALREADY_CANCELLED')) throw e // 동시 요청이 먼저 복원한 경우는 무시
    }
  }
  return count
}

export async function changeTrialPrice(packageId: number, price: number, otherMethod: PaymentMethod | null) {
  const { data: before } = await supabase.from('sh_shop_trial_packages').select('price').eq('id', packageId).maybeSingle()
  const result = await rpc<{ package: TrialPackageRow; payment: Payment | null }>('sh_shop_trial_price', {
    p_package_id: packageId, p_price: price, p_other_method: otherMethod,
  })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_price_changed',
    description: `${pkgLabel(result.package)} 금액 변경 ${(before?.price ?? 0).toLocaleString()}원 → ${price.toLocaleString()}원${result.payment ? ` (${describePayment(result.payment)})` : ''}`,
    new_value: result,
  })
  return result
}

/** 고객별 유효 첫체험권 */
export async function activeTrialsFor(customerIds: number[]) {
  const map = new Map<number, TrialPackageRow>()
  const ids = [...new Set(customerIds.filter(Boolean))]
  if (ids.length === 0) return map
  const { data } = await supabase.from('sh_shop_trial_packages').select('*').in('customer_id', ids).eq('status', 'active')
  for (const p of (data ?? []) as TrialPackageRow[]) if (p.customer_id) map.set(p.customer_id, p)
  return map
}

/** 예약 행마다 고객의 첫체험 배지 정보(trial) 병합 — 남은 횟수 없으면 null */
export async function withTrial<T extends { customer_id: number | null }>(rows: T[]) {
  const trials = await activeTrialsFor(rows.map(r => r.customer_id ?? 0))
  const today = kstToday()
  return rows.map(r => {
    const p = r.customer_id ? trials.get(r.customer_id) : undefined
    const badge = p ? trialBadge(p, today) : null
    return {
      ...r,
      trial: p && badge
        ? { package_id: p.id, basic_left: p.basic_total - p.basic_used, special_left: p.special_total - p.special_used, expires_on: p.expires_on, ...badge }
        : null,
    }
  })
}
