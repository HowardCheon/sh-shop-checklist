import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { bonusFor } from '@/lib/booking/prepaid'
import { BookingError } from '@/lib/booking/errors'

/* 선불 충전 — { amount: 500000 | 1000000 | 2000000, memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { amount, memo } = await req.json()

  let bonus: number
  try {
    bonus = bonusFor(Number(amount))
  } catch (e) {
    return NextResponse.json({ error: e instanceof BookingError ? e.message : '충전 금액 오류' }, { status: 400 })
  }

  const { data: customer } = await supabase
    .from('sh_shop_customers')
    .select('id, prepaid_cash, prepaid_bonus')
    .eq('id', id)
    .single()
  if (!customer) return NextResponse.json({ error: '고객 없음' }, { status: 404 })

  const cash = customer.prepaid_cash + Number(amount)
  const bonusBalance = customer.prepaid_bonus + bonus

  // 조회 이후 잔액이 바뀌었으면 갱신되지 않도록 기존 값 조건 포함
  const { data: updated, error } = await supabase
    .from('sh_shop_customers')
    .update({ prepaid_cash: cash, prepaid_bonus: bonusBalance, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('prepaid_cash', customer.prepaid_cash)
    .eq('prepaid_bonus', customer.prepaid_bonus)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: '충전 실패' }, { status: 500 })
  if (!updated) return NextResponse.json({ error: '잔액이 변경되었습니다. 새로고침 후 다시 시도하세요' }, { status: 409 })

  const description = `선불 충전 ${Number(amount).toLocaleString()}원${bonus ? ` + 보너스 ${bonus.toLocaleString()}원` : ''}${memo ? ` (${memo})` : ''}`
  const { error: ledgerError } = await supabase.from('sh_shop_prepaid_ledger').insert({
    customer_id: customer.id,
    type: 'charge',
    cash_amount: Number(amount),
    bonus_amount: bonus,
    cash_balance_after: cash,
    bonus_balance_after: bonusBalance,
    memo: memo || null,
  })
  if (ledgerError) console.error('선불 원장 기록 실패', { customerId: customer.id, amount, ledgerError })
  const { data: history } = await supabase
    .from('sh_shop_customer_history')
    .insert({
      customer_id: customer.id,
      action: 'prepaid_charged',
      actor: 'admin',
      description,
      new_value: { prepaid_cash: cash, prepaid_bonus: bonusBalance },
    })
    .select()
    .single()

  return NextResponse.json({ customer: updated, history })
}
