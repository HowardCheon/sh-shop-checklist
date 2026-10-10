/* 소개 보너스 조회·소개자 지정 — 적립/회수는 DB 트리거(sh_shop_referral_sync)가 결제와 같은 트랜잭션에서 처리 */
import { supabase } from '@/lib/supabase'
import { isoToKst } from '@/lib/booking/time'
import { recordCustomerHistory } from '@/lib/booking/admin'
import { rpc } from '@/lib/payments'
import { referralWindow } from '@/lib/referral'

type Named = { id: number; name: string }

/** 고객별 첫 관리일(KST) — 유효 결제 중 예약 연결(예약일) 또는 첫체험권 결제(결제일) */
async function firstServiceDates(customerIds: number[]) {
  const first = new Map<number, string>()
  if (!customerIds.length) return first
  const [pays, trials] = await Promise.all([
    supabase.from('sh_shop_payments').select('id, customer_id, created_at, reservation:sh_shop_reservations(start_at)')
      .in('customer_id', customerIds).eq('status', 'paid'),
    supabase.from('sh_shop_trial_packages').select('payment_id').in('customer_id', customerIds).not('payment_id', 'is', null),
  ])
  if (pays.error) throw pays.error
  if (trials.error) throw trials.error
  const trialPay = new Set((trials.data ?? []).map(t => t.payment_id))
  for (const p of pays.data ?? []) {
    const resv = (Array.isArray(p.reservation) ? p.reservation[0] : p.reservation) as { start_at: string } | null
    const date = resv ? isoToKst(resv.start_at).date : trialPay.has(p.id) ? isoToKst(p.created_at).date : null
    if (!date || p.customer_id == null) continue
    const cur = first.get(p.customer_id)
    if (!cur || date < cur) first.set(p.customer_id, date)
  }
  return first
}

const windowOf = (start: string | undefined) => (start ? referralWindow(start) : null)

export async function getReferralInfo(customerId: number) {
  const { data: me, error } = await supabase.from('sh_shop_customers')
    .select('id, referred_by, referred_at').eq('id', customerId).maybeSingle()
  if (error) throw error
  if (!me) return null

  const [referrerRow, rewardsAsReferred, referredList, rewardsAsReferrer] = await Promise.all([
    me.referred_by
      ? supabase.from('sh_shop_customers').select('id, name').eq('id', me.referred_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('sh_shop_referral_rewards').select('reward_amount').eq('referred_id', customerId),
    supabase.from('sh_shop_customers').select('id, name').eq('referred_by', customerId).order('name'),
    supabase.from('sh_shop_referral_rewards').select('referred_id, reward_amount').eq('referrer_id', customerId),
  ])
  for (const r of [referrerRow, rewardsAsReferred, referredList, rewardsAsReferrer]) if (r.error) throw r.error

  const referred = (referredList.data ?? []) as Named[]
  const first = await firstServiceDates([customerId, ...referred.map(c => c.id)])
  const earned = new Map<number, number>()
  for (const r of rewardsAsReferrer.data ?? []) {
    if (r.referred_id != null) earned.set(r.referred_id, (earned.get(r.referred_id) ?? 0) + r.reward_amount)
  }

  return {
    referrer: (referrerRow.data as Named | null) ?? null,
    referred_at: me.referred_at as string | null,
    window: windowOf(first.get(customerId)),
    rewarded: (rewardsAsReferred.data ?? []).reduce((s, r) => s + r.reward_amount, 0),
    locked: (rewardsAsReferred.data ?? []).length > 0,
    referred: referred.map(c => ({ ...c, rewarded: earned.get(c.id) ?? 0, window: windowOf(first.get(c.id)) })),
  }
}

export type ReferralInfo = NonNullable<Awaited<ReturnType<typeof getReferralInfo>>>

/** 소개자 지정/해제 — 보너스 지급 기록이 있으면 DB 가 REFERRAL_LOCKED 로 거절 */
export async function setReferrer(customerId: number, referrerId: number | null) {
  const { data: before } = await supabase.from('sh_shop_customers').select('referred_by').eq('id', customerId).maybeSingle()
  const customer = await rpc<{ id: number; referred_by: number | null }>('sh_shop_set_referrer', { p_customer_id: customerId, p_referrer_id: referrerId })
  if ((before?.referred_by ?? null) === referrerId) return customer
  const nameOf = async (id: number | null) =>
    id ? (await supabase.from('sh_shop_customers').select('name').eq('id', id).maybeSingle()).data?.name ?? `#${id}` : null
  const oldName = before?.referred_by ? await nameOf(before.referred_by) : null
  const newName = await nameOf(referrerId)
  await recordCustomerHistory(customerId, {
    action: 'referrer_changed',
    description: newName ? `소개자 ${oldName ? `${oldName} → ` : ''}${newName}` : `소개자 해제 (${oldName})`,
    old_value: { referred_by: before?.referred_by ?? null },
    new_value: { referred_by: referrerId },
  })
  return customer
}
