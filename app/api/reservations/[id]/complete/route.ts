import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { BookingError } from '@/lib/booking/errors'
import { validateUse } from '@/lib/booking/trial'
import { pay, voidPayment, paymentErrorResponse, describePayment, type PaymentMethod } from '@/lib/payments'
import { useTrial, cancelTrialUse, trialUseLabel } from '@/lib/trial'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 시술 완료 + 결제 (+ 첫체험 차감) — { amount, use_prepaid, other_method?, memo?, trial?: { package_id, kind, care_name? } } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, use_prepaid, other_method, memo, trial } = await req.json()

  const value = Number(amount)
  if (!Number.isInteger(value) || value < 0) return NextResponse.json({ error: '결제 금액을 확인하세요' }, { status: 400 })
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })

  const { data: existing } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: '예약 없음' }, { status: 404 })
  if (existing.status !== 'scheduled') return NextResponse.json({ error: '예약 상태에서만 완료 처리할 수 있습니다' }, { status: 409 })

  // 첫체험 차감 요청 검증 — 이 예약 고객의 유효 첫체험권이어야 함
  let trialReq: { packageId: number; kind: 'basic' | 'special'; careName: string | null } | null = null
  if (trial) {
    try {
      const v = validateUse(trial.kind, trial.care_name)
      trialReq = { packageId: Number(trial.package_id), kind: v.kind, careName: v.careName }
    } catch (e) {
      return NextResponse.json({ error: e instanceof BookingError ? e.message : '첫체험 입력 오류' }, { status: 400 })
    }
    const { data: pkg } = await supabase.from('sh_shop_trial_packages').select('id, customer_id, status').eq('id', trialReq.packageId).maybeSingle()
    if (!pkg || pkg.status !== 'active' || !existing.customer_id || pkg.customer_id !== existing.customer_id) {
      return NextResponse.json({ error: '이 고객의 첫체험권이 아닙니다' }, { status: 400 })
    }
  }

  let payment
  try {
    payment = await pay({
      customerId: existing.customer_id,
      reservationId: existing.id,
      amount: value,
      usePrepaid: !!use_prepaid,
      otherMethod: other_method ?? null,
      memo: memo?.trim() || null,
    })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }

  // 첫체험 차감 (예약 연결) — 실패하면 결제 되돌림
  let trialUse = null
  if (trialReq) {
    try {
      trialUse = (await useTrial(trialReq.packageId, trialReq.kind, trialReq.careName, null, existing.id)).use
    } catch (e) {
      await voidPayment(payment.id).catch(err => console.error('결제 롤백 실패', err))
      const { body, status } = paymentErrorResponse(e)
      return NextResponse.json(body, { status })
    }
  }

  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .update({ status: 'completed', price: value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled')
    .select()
    .maybeSingle()
  if (error || !data) {
    // 상태 변경 실패 시 첫체험 차감·결제 되돌림
    if (trialUse) await cancelTrialUse(trialUse.id).catch(err => console.error('첫체험 롤백 실패', err))
    await voidPayment(payment.id).catch(err => console.error('결제 롤백 실패', err))
    return NextResponse.json({ error: '완료 처리에 실패했습니다' }, { status: error ? 500 : 409 })
  }

  await supabase.from('sh_shop_reservation_history').insert({
    reservation_id: data.id,
    action: 'completed',
    description: `시술 완료 · ${describePayment(payment)}${trialUse ? ` · 첫체험 ${trialUseLabel(trialUse)} 차감` : ''}`,
    old_value: existing,
    new_value: data,
  })

  return NextResponse.json({ ...data, payment, trial_use: trialUse })
}
