import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/booking/phone'
import { setReferrer } from '@/lib/referral-repo'

function cleanPhone(phone: unknown): string | null {
  if (typeof phone !== 'string' || !phone.trim()) return null
  try { return normalizePhone(phone) } catch { return phone.trim() }
}

export async function GET() {
  const { data, error } = await supabase
    .from('sh_shop_customers')
    .select(`
      *,
      reservations:sh_shop_reservations(id, status, product_name, start_at, price)
    `)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, phone, memo, referred_by } = body
  if (!name?.trim()) return NextResponse.json({ error: '고객명 필수' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_customers')
    .insert({ name: name.trim(), phone: cleanPhone(phone), memo: memo || null })
    .select()
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: '이미 등록된 전화번호입니다' }, { status: 409 })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  // 소개자 (선택) — 실패해도 고객 등록은 유지
  if (referred_by != null && Number(referred_by) > 0) {
    try {
      return NextResponse.json(await setReferrer(data.id, Number(referred_by)))
    } catch (e) {
      console.error('소개자 지정 실패', e)
    }
  }
  return NextResponse.json(data)
}
