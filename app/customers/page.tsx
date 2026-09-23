import { connection } from 'next/server'
import { supabase } from '@/lib/supabase'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  // 요청 시점의 최신 목록을 보여주도록 빌드 시 정적 생성 방지
  await connection()

  const { data } = await supabase
    .from('sh_shop_customers')
    .select('*, reservations:sh_shop_reservations(id, status, product_name, start_at, price)')
    .order('name')

  return <CustomersClient initialCustomers={data ?? []} />
}
