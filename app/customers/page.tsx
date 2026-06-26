import { supabase } from '@/lib/supabase'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  const { data } = await supabase
    .from('sh_shop_customers')
    .select('*, reservations:sh_shop_reservations(id, status, product_name, start_at, price)')
    .order('name')

  return <CustomersClient initialCustomers={data ?? []} />
}
