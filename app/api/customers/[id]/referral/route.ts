import { NextRequest, NextResponse } from 'next/server'
import { getReferralInfo, setReferrer } from '@/lib/referral-repo'
import { paymentErrorResponse } from '@/lib/payments'

/* 소개 정보 — 소개자, 적용 기간, 이 고객이 소개한 고객과 누적 보너스 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const info = await getReferralInfo(Number(id))
    if (!info) return NextResponse.json({ error: '고객 없음' }, { status: 404 })
    return NextResponse.json(info)
  } catch (e) {
    console.error('소개 정보 조회 실패', e)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

/* 소개자 지정/해제 — { referrer_id: number | null } */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { referrer_id } = await req.json().catch(() => ({}))
  const referrerId = referrer_id == null ? null : Number(referrer_id)
  if (referrerId !== null && !(Number.isInteger(referrerId) && referrerId > 0)) {
    return NextResponse.json({ error: '소개자를 다시 선택하세요' }, { status: 400 })
  }
  try {
    await setReferrer(Number(id), referrerId)
    return NextResponse.json(await getReferralInfo(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
