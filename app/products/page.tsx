import { connection } from 'next/server'
import { supabase } from '@/lib/supabase'
import ProductsClient from './ProductsClient'

export default async function ProductsPage() {
  // 요청 시점의 최신 목록을 보여주도록 빌드 시 정적 생성 방지
  await connection()

  const { data } = await supabase
    .from('sh_shop_products')
    .select('*')
    .eq('category', 'service')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return <ProductsClient initialProducts={data ?? []} />
}
