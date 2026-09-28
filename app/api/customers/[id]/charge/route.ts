import { NextRequest, NextResponse } from 'next/server'
import { bonusFor } from '@/lib/booking/prepaid'
import { BookingError } from '@/lib/booking/errors'
import { charge, paymentErrorResponse } from '@/lib/payments'

/* 선불 충전 — { amount: 500000 | 1000000 | 2000000, memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, memo } = await req.json()

  let bonus: number
  try {
    bonus = bonusFor(Number(amount))
  } catch (e) {
    return NextResponse.json({ error: e instanceof BookingError ? e.message : '충전 금액 오류' }, { status: 400 })
  }

  try {
    const customer = await charge(Number(id), Number(amount), bonus, memo?.trim() || null)
    return NextResponse.json({ customer })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
