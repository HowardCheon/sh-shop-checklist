import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { voidPayment, paymentErrorResponse, PaymentError } from '@/lib/payments'
import { cancelReservationTrialUses } from '@/lib/trial'

/** 예약 결제 취소 후속 처리 — 그 예약의 첫체험 차감 복원 + 완료 예약을 '예약' 상태로 되돌림 */
async function restoreReservation(reservationId: number) {
  // 같은 예약에 유효 결제가 남아 있으면(다시 완료된 경우) 건드리지 않음
  const { count } = await supabase.from('sh_shop_payments').select('id', { count: 'exact', head: true }).eq('reservation_id', reservationId).eq('status', 'paid')
  if ((count ?? 0) > 0) return
  await cancelReservationTrialUses(reservationId)
  const { data: reverted } = await supabase
    .from('sh_shop_reservations')
    .update({ status: 'scheduled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('status', 'completed')
    .select('id')
    .maybeSingle()
  if (reverted) {
    await supabase.from('sh_shop_reservation_history').insert({
      reservation_id: reservationId,
      action: 'updated',
      description: '결제 취소로 예약 상태 복원',
    })
  }
}

/* 결제 취소 — 선불 차감분 복원, 예약 결제면 예약을 '예약' 상태로 되돌리고 그 예약의 첫체험 차감도 복원.
   후속 처리가 중간에 실패했어도 같은 결제를 다시 취소하면(이미 취소됨 409) 후속 처리를 마무리한다. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payment = await voidPayment(Number(id))
    if (payment.reservation_id) await restoreReservation(payment.reservation_id)
    return NextResponse.json({ payment })
  } catch (e) {
    if (e instanceof PaymentError && e.code === 'ALREADY_VOIDED') {
      const { data: p } = await supabase.from('sh_shop_payments').select('reservation_id').eq('id', id).maybeSingle()
      if (p?.reservation_id) await restoreReservation(p.reservation_id).catch(err => console.error('예약 복원 마무리 실패', err))
    }
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
