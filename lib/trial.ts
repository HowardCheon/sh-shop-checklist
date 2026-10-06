/* 첫체험 패키지 — 등록·사용·취소는 DB 함수(트랜잭션 + 행 잠금), 고객 이력 기록 */
import { recordCustomerHistory } from '@/lib/booking/admin'
import { TRIAL_PACKAGES, type TrialCode, type TrialKind, type TrialPackageRow, type TrialUseRow } from '@/lib/booking/trial'
import { describePayment, rpc, type Payment, type PaymentMethod } from '@/lib/payments'

const pkgLabel = (p: TrialPackageRow) => TRIAL_PACKAGES[p.package_code as TrialCode]?.label ?? p.package_code
const useLabel = (u: TrialUseRow) => (u.kind === 'basic' ? '베이직' : `스페셜 - ${u.care_name}`)
const remain = (p: TrialPackageRow) => `남은 베이직 ${p.basic_total - p.basic_used} · 스페셜 ${p.special_total - p.special_used}`

export async function registerTrial(customerId: number, code: TrialCode, usePrepaid: boolean, otherMethod: PaymentMethod | null) {
  const def = TRIAL_PACKAGES[code]
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

export async function useTrial(packageId: number, kind: TrialKind, careName: string | null, memo: string | null) {
  const result = await rpc<{ use: TrialUseRow; package: TrialPackageRow }>('sh_shop_trial_use', {
    p_package_id: packageId, p_kind: kind, p_care_name: careName, p_memo: memo,
  })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_used',
    description: `${pkgLabel(result.package)} ${useLabel(result.use)} 사용 (${remain(result.package)})${memo ? ` · ${memo}` : ''}`,
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
