import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse } from '@/lib/payments'
import { unpayTrial } from '@/lib/trial'

/* 첫체험권 결제 취소 → 미결제로 (선불 사용분 복원, 등록·사용 내역 유지) */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await unpayTrial(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
