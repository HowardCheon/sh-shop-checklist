import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* 선불 잔액 + 원장 + 결제 내역 + 고객 이력 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [customer, ledger, payments, history] = await Promise.all([
    supabase.from('sh_shop_customers').select('prepaid_cash, prepaid_bonus').eq('id', id).single(),
    supabase.from('sh_shop_prepaid_ledger').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('sh_shop_payments').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('sh_shop_customer_history').select('id, action, actor, description, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
  ])
  if (customer.error || ledger.error || payments.error || history.error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
  return NextResponse.json({ balance: customer.data, ledger: ledger.data, payments: payments.data, history: history.data })
}
