import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { BookingError } from '@/lib/booking/errors'
import { trialPackage } from '@/lib/booking/trial'
import { paymentErrorResponse, type PaymentMethod } from '@/lib/payments'
import { registerTrial } from '@/lib/trial'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 유효 첫체험 패키지 + 사용 내역 + 선불 잔액(등록 결제 미리보기용) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [customer, pkg] = await Promise.all([
    supabase.from('sh_shop_customers').select('prepaid_cash, prepaid_bonus').eq('id', id).maybeSingle(),
    supabase.from('sh_shop_trial_packages').select('*').eq('customer_id', id).eq('status', 'active').maybeSingle(),
  ])
  if (customer.error || pkg.error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  if (!customer.data) return NextResponse.json({ error: '고객 없음' }, { status: 404 })
  let uses: unknown[] = []
  if (pkg.data) {
    const { data, error } = await supabase.from('sh_shop_trial_uses').select('*').eq('package_id', pkg.data.id).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    uses = data
  }
  return NextResponse.json({ package: pkg.data, uses, balance: customer.data })
}

/* 첫체험 등록 + 결제 — { code, use_prepaid, other_method?, price? } (구성은 서버 상수, 가격은 지정 시 그 금액) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const { code, use_prepaid, other_method, price } = body
  if (price !== undefined && price !== null && (!Number.isInteger(price) || price < 1)) return NextResponse.json({ error: '금액은 1원 이상 정수로 입력하세요' }, { status: 400 })
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })
  try {
    const def = trialPackage(code)
    return NextResponse.json(await registerTrial(Number(id), def.code, !!use_prepaid, other_method ?? null, price ?? undefined))
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status })
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
