/* 샵 가계부 조회 — 직접 입력 내역 + 자동 매출(관리자 앱 결제·선불·첫체험) + 선불 원장 */
import { supabase } from '@/lib/supabase'
import { kstToIso, isoToKst } from '@/lib/booking/time'
import type { AutoRow, EntryRow, Io, Method, PrepaidRow } from './summary'

/** 이 날(KST)부터 관리자 앱 기록으로 매출 자동 계산 — 그 이전은 수기 매출 */
export const LEDGER_AUTO_FROM = '2026-10-06'

export type Category = { id: number; io: Io; name: string; sort: number; hidden: boolean; uses: number }

const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export async function listCategories(): Promise<Category[]> {
  const [cats, counts] = await Promise.all([
    supabase.from('sh_shop_ledger_categories').select('id, io, name, sort, hidden').order('io').order('sort').order('id'),
    supabase.from('sh_shop_ledger_entries').select('category_id'),
  ])
  if (cats.error) throw cats.error
  const uses = new Map<number, number>()
  for (const r of counts.data ?? []) uses.set(r.category_id, (uses.get(r.category_id) ?? 0) + 1)
  return (cats.data ?? []).map(c => ({ ...c, uses: uses.get(c.id) ?? 0 })) as Category[]
}

export async function loadMonth(month: string) {
  const fromDate = `${month}-01`
  const toDate = `${nextMonth(month)}-01`
  const fromIso = kstToIso(fromDate, '00:00')
  const toIso = kstToIso(toDate, '00:00')
  const autoFromIso = kstToIso(LEDGER_AUTO_FROM, '00:00')
  const autoStart = fromIso > autoFromIso ? fromIso : autoFromIso
  const autoActive = autoStart < toIso

  const [entries, prepaidAll, charges, payments, balances, categories] = await Promise.all([
    supabase.from('sh_shop_ledger_entries').select('*, category:sh_shop_ledger_categories(id, name)')
      .gte('entry_date', fromDate).lt('entry_date', toDate).order('created_at'),
    supabase.from('sh_shop_prepaid_ledger').select('created_at, type, cash_amount, bonus_amount').lt('created_at', toIso),
    autoActive
      ? supabase.from('sh_shop_prepaid_ledger').select('created_at, type, cash_amount, customer:sh_shop_customers(id, name)')
        .in('type', ['charge', 'refund']).gte('created_at', autoStart).lt('created_at', toIso)
      : Promise.resolve({ data: [], error: null }),
    autoActive
      ? supabase.from('sh_shop_payments').select('id, created_at, other_amount, other_method, reservation_id, customer:sh_shop_customers(id, name), reservation:sh_shop_reservations(start_at, product_name)')
        .eq('status', 'paid').gt('other_amount', 0).gte('created_at', autoStart).lt('created_at', toIso)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('sh_shop_customers').select('id, name, prepaid_cash, prepaid_bonus').or('prepaid_cash.gt.0,prepaid_bonus.gt.0').order('name'),
    listCategories(),
  ])
  for (const r of [entries, prepaidAll, charges, payments, balances]) if (r.error) throw r.error

  // 첫체험 결제 구분
  const payIds = (payments.data ?? []).map(p => p.id)
  const trialPayIds = new Set<number>()
  if (payIds.length) {
    const { data } = await supabase.from('sh_shop_trial_packages').select('payment_id').in('payment_id', payIds)
    for (const t of data ?? []) if (t.payment_id) trialPayIds.add(t.payment_id)
  }

  type Named = { id: number; name: string } | null
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const auto: AutoRow[] = [
    ...(charges.data ?? []).map(c => {
      const cust = one(c.customer as Named | Named[])
      return {
        at: c.created_at, kind: c.type === 'refund' ? 'refund' as const : 'charge' as const, amount: c.cash_amount, method: null,
        label: `${c.type === 'refund' ? '선불 환불' : '선불 충전'} · ${cust?.name ?? '-'}`, link: cust ? `/customers/${cust.id}` : undefined,
      }
    }),
    ...(payments.data ?? []).map(p => {
      const cust = one(p.customer as Named | Named[])
      const resv = one(p.reservation as { start_at: string; product_name: string | null } | { start_at: string; product_name: string | null }[] | null)
      const trial = trialPayIds.has(p.id)
      return {
        at: p.created_at, kind: trial ? 'trial' as const : 'payment' as const, amount: p.other_amount, method: p.other_method as Method | null,
        label: `${trial ? '첫체험' : resv ? '시술' : '결제'} · ${cust?.name ?? '-'}${resv?.product_name ? ` (${resv.product_name})` : ''}`,
        link: resv && p.reservation_id ? `/?date=${isoToKst(resv.start_at).date}&open=${p.reservation_id}` : cust ? `/customers/${cust.id}` : undefined,
      }
    }),
  ]

  const prepaid: PrepaidRow[] = (prepaidAll.data ?? []).map(r => ({ at: r.created_at, type: r.type, cash: r.cash_amount, bonus: r.bonus_amount }))
  return {
    entries: (entries.data ?? []) as EntryRow[],
    auto,
    prepaid,
    balances: (balances.data ?? []).map(b => ({ id: b.id, name: b.name, cash: b.prepaid_cash, bonus: b.prepaid_bonus })),
    categories,
    autoFrom: LEDGER_AUTO_FROM,
  }
}
