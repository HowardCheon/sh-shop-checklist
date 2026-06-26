import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
  const { name, phone, memo } = body
  if (!name?.trim()) return NextResponse.json({ error: '고객명 필수' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_customers')
    .insert({ name: name.trim(), phone: phone || null, memo: memo || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}
