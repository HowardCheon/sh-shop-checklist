import { NextRequest, NextResponse } from 'next/server'
import { grantBonus, paymentErrorResponse } from '@/lib/payments'

/* 보너스 수동 추가 — { amount, memo } (사유 필수) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, memo } = await req.json().catch(() => ({}))
  const value = Number(amount)
  if (!Number.isInteger(value) || value < 1) return NextResponse.json({ error: '보너스는 1원 이상 정수로 입력하세요' }, { status: 400 })
  if (typeof memo !== 'string' || !memo.trim()) return NextResponse.json({ error: '사유를 입력하세요' }, { status: 400 })
  try {
    const customer = await grantBonus(Number(id), value, memo.trim().slice(0, 200))
    return NextResponse.json({ customer })
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
