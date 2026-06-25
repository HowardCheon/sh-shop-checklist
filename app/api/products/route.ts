import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('sh_shop_products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { category, name, price, duration_min, stock, description } = body

  if (!name?.trim()) return NextResponse.json({ error: '상품명 필수' }, { status: 400 })
  if (!category) return NextResponse.json({ error: '카테고리 필수' }, { status: 400 })
  if (price == null) return NextResponse.json({ error: '가격 필수' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_products')
    .insert({ category, name: name.trim(), price, duration_min: duration_min ?? null, stock: stock ?? null, description: description || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}
