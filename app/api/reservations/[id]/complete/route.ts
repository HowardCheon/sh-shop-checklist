import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { pay, voidPayment, paymentErrorResponse, describePayment, type PaymentMethod } from '@/lib/payments'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 시술 완료 + 결제 — { amount, use_prepaid, other_method?, memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, use_prepaid, other_method, memo } = await req.json()

  const value = Number(amount)
  if (!Number.isInteger(value) || value < 0) return NextResponse.json({ error: '결제 금액을 확인하세요' }, { status: 400 })
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })

  const { data: existing } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: '예약 없음' }, { status: 404 })
  if (existing.status !== 'scheduled') return NextResponse.json({ error: '예약 상태에서만 완료 처리할 수 있습니다' }, { status: 409 })

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

  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .update({ status: 'completed', price: value, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'scheduled')
    .select()
    .maybeSingle()
  if (error || !data) {
    // 상태 변경 실패 시 결제 되돌림
    await voidPayment(payment.id).catch(err => console.error('결제 롤백 실패', err))
    return NextResponse.json({ error: '완료 처리에 실패했습니다' }, { status: error ? 500 : 409 })
  }

  await supabase.from('sh_shop_reservation_history').insert({
    reservation_id: data.id,
    action: 'completed',
    description: `시술 완료 · ${describePayment(payment)}`,
    old_value: existing,
    new_value: data,
  })

  return NextResponse.json({ ...data, payment })
}
