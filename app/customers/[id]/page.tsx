import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { supabase } from '@/lib/supabase'
import CustomerDetailClient from './CustomerDetailClient'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params

  const [{ data }, { data: history }] = await Promise.all([
    supabase
      .from('sh_shop_customers')
      .select('*, reservations:sh_shop_reservations(id, status, product_name, start_at, price)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('sh_shop_customer_history')
      .select('id, action, actor, description, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!data) notFound()
  return <CustomerDetailClient initialCustomer={data} initialHistory={history ?? []} />
}
