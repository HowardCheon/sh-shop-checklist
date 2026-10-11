import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse, type PaymentMethod } from '@/lib/payments'
import { payTrial } from '@/lib/trial'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 미결제 첫체험권 결제 — { use_prepaid, other_method? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { use_prepaid, other_method } = await req.json().catch(() => ({}))
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })
  try {
    return NextResponse.json(await payTrial(Number(id), use_prepaid === true, other_method ?? null))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
