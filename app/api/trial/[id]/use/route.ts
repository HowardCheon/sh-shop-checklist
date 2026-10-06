import { NextRequest, NextResponse } from 'next/server'
import { BookingError } from '@/lib/booking/errors'
import { validateUse } from '@/lib/booking/trial'
import { paymentErrorResponse } from '@/lib/payments'
import { useTrial } from '@/lib/trial'

/* 첫체험 1회 사용 — { kind: basic|special, care_name?, memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const { kind, care_name, memo } = body
  try {
    const v = validateUse(kind, care_name)
    return NextResponse.json(await useTrial(Number(id), v.kind, v.careName, typeof memo === 'string' && memo.trim() ? memo.trim() : null))
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status })
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
