import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { voidPayment, paymentErrorResponse } from '@/lib/payments'

/* 결제 취소 — 선불 차감분 복원, 예약 결제면 예약을 '예약' 상태로 되돌림 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payment = await voidPayment(Number(id))
    if (payment.reservation_id) {
      const { data: reverted } = await supabase
        .from('sh_shop_reservations')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', payment.reservation_id)
        .eq('status', 'completed')
        .select('id')
        .maybeSingle()
      if (reverted) {
        await supabase.from('sh_shop_reservation_history').insert({
          reservation_id: payment.reservation_id,
          action: 'updated',
          description: '결제 취소로 예약 상태 복원',
        })
      }
    }
    return NextResponse.json({ payment })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
