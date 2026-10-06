import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse, type PaymentMethod } from '@/lib/payments'
import { changeTrialPrice } from '@/lib/trial'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 첫체험권 금액 수정 — { price, other_method? } 패키지 가격 + 연결 결제 금액 함께 수정 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const { price, other_method } = body
  if (!Number.isInteger(price) || price < 0) return NextResponse.json({ error: '금액은 0원 이상 정수로 입력하세요' }, { status: 400 })
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })
  try {
    return NextResponse.json(await changeTrialPrice(Number(id), price, other_method ?? null))
  } catch (e) {
    const { body: errBody, status } = paymentErrorResponse(e)
    return NextResponse.json(errBody, { status })
  }
}
