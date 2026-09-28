import { NextRequest, NextResponse } from 'next/server'
import { voidPayment, paymentErrorResponse } from '@/lib/payments'

/* 결제 취소 — 선불 차감분 복원 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json({ payment: await voidPayment(Number(id)) })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
