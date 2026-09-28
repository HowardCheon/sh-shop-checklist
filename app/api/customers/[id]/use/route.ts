import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { pay, paymentErrorResponse } from '@/lib/payments'

/* 선불 직접 차감 (예약 없는 사용) — { amount, memo } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, memo } = await req.json()
  const value = Number(amount)
  if (!Number.isInteger(value) || value <= 0) return NextResponse.json({ error: '차감 금액을 입력하세요' }, { status: 400 })
  if (!memo?.trim()) return NextResponse.json({ error: '차감 사유(메모)를 입력하세요' }, { status: 400 })

  const { data: customer } = await supabase.from('sh_shop_customers').select('prepaid_cash, prepaid_bonus').eq('id', id).single()
  if (!customer) return NextResponse.json({ error: '고객 없음' }, { status: 404 })
  if (value > customer.prepaid_cash + customer.prepaid_bonus) {
    return NextResponse.json({ error: '잔액보다 큰 금액은 차감할 수 없습니다' }, { status: 400 })
  }

  try {
    // 잔액 확인 후 동시 차감이 있어도 부족분이 생기면 DB 함수가 OTHER_METHOD_REQUIRED 로 거부
    const payment = await pay({ customerId: Number(id), reservationId: null, amount: value, usePrepaid: true, otherMethod: null, memo: memo.trim() })
    return NextResponse.json({ payment })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
