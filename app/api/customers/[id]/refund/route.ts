import { NextRequest, NextResponse } from 'next/server'
import { refund, paymentErrorResponse } from '@/lib/payments'

/* 선불 환불 — 실제 잔액 환불, 보너스 소멸. { memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { memo } = await req.json().catch(() => ({}))
  try {
    return NextResponse.json(await refund(Number(id), memo?.trim() || null))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
