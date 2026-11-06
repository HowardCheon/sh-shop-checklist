import { NextRequest, NextResponse } from 'next/server'
import { pay, paymentErrorResponse, type PaymentMethod } from '@/lib/payments'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 결제 추가 (제품 구매 등 예약 없는 결제) — { amount, memo, use_prepaid?, other_method? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const { amount, memo, use_prepaid, other_method } = body
  if (!Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: '결제 금액을 입력하세요' }, { status: 400 })
  if (typeof memo !== 'string' || !memo.trim()) return NextResponse.json({ error: '품목을 입력하세요' }, { status: 400 })
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })
  if (!use_prepaid && !other_method) return NextResponse.json({ error: '결제수단을 선택하세요' }, { status: 400 })

  try {
    const payment = await pay({
      customerId: Number(id),
      reservationId: null,
      amount,
      usePrepaid: !!use_prepaid,
      otherMethod: other_method ?? null,
      memo: memo.trim(),
      label: '결제 추가',
    })
    return NextResponse.json({ payment })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
