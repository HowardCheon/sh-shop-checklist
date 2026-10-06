import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse } from '@/lib/payments'
import { cancelTrialUse } from '@/lib/trial'

/* 첫체험 사용 1건 취소 — 횟수 복원 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await cancelTrialUse(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
