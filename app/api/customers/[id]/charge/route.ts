import { NextRequest, NextResponse } from 'next/server'
import { bonusFor, validateCustomCharge } from '@/lib/booking/prepaid'
import { BookingError } from '@/lib/booking/errors'
import { charge, paymentErrorResponse } from '@/lib/payments'

/* 선불 충전 — { amount: 500000 | 1000000 | 2000000, memo? } 또는 직접 입력 { custom: true, amount, bonus? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, memo, custom, bonus: customBonus } = await req.json()

  let bonus: number
  let value = Number(amount)
  try {
    if (custom === true) {
      const v = validateCustomCharge(amount, customBonus)
      value = v.amount
      bonus = v.bonus
    } else {
      bonus = bonusFor(value)
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof BookingError ? e.message : '충전 금액 오류' }, { status: 400 })
  }

  try {
    const customer = await charge(Number(id), value, bonus, memo?.trim() || (custom === true ? '직접 충전' : null))
    return NextResponse.json({ customer })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
