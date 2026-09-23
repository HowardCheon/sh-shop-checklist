// 고객 목록·상세 화면 공용 타입/계산

export interface Reservation {
  id: number
  product_name: string | null
  start_at: string
  price: number | null
  status: 'scheduled' | 'completed' | 'cancelled'
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  memo: string | null
  created_at: string
  updated_at: string
  reservations?: Reservation[]
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
export const fmtPrice = (n: number) => n.toLocaleString() + '원'

export const STATUS_LABEL = { scheduled: '예약', completed: '완료', cancelled: '취소' } as const
export const STATUS_COLOR = { scheduled: '#bc7659', completed: '#7c9a7e', cancelled: '#9ca3af' } as const
export const STATUS_BG    = { scheduled: '#faf4f0', completed: '#f0f4ef', cancelled: '#f9fafb' } as const

export function calcStats(customer: Customer) {
  const rs = customer.reservations ?? []
  const now = new Date().toISOString()
  const completed = rs.filter(r => r.status === 'completed')
  const cancelled = rs.filter(r => r.status === 'cancelled')
  const byProduct: Record<string, number> = {}
  completed.forEach(r => { if (r.product_name) byProduct[r.product_name] = (byProduct[r.product_name] ?? 0) + 1 })
  const sortedComp = [...completed].sort((a,b) => b.start_at.localeCompare(a.start_at))
  return {
    totalCount: rs.filter(r => r.status !== 'cancelled').length,
    completedCount: completed.length,
    cancelCount: cancelled.length,
    totalAmount: completed.reduce((s,r) => s + (r.price ?? 0), 0),
    lastVisit: sortedComp[0]?.start_at ?? null,
    byProduct,
    upcoming: rs.filter(r => r.status === 'scheduled' && r.start_at >= now).sort((a,b) => a.start_at.localeCompare(b.start_at)),
    past: rs.filter(r => r.status !== 'scheduled' || r.start_at < now).sort((a,b) => b.start_at.localeCompare(a.start_at)),
  }
}
