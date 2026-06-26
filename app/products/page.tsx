import { supabase } from '@/lib/supabase'
import ProductsClient from './ProductsClient'

export default async function ProductsPage() {
  const { data } = await supabase
    .from('sh_shop_products')
    .select('*')
    .eq('category', 'service')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return <ProductsClient initialProducts={data ?? []} />
}
