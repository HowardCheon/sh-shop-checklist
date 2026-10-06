import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse } from '@/lib/payments'
import { cancelTrial } from '@/lib/trial'

/* 첫체험 등록 취소 — 사용 내역 없을 때만, 결제 함께 취소 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await cancelTrial(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
