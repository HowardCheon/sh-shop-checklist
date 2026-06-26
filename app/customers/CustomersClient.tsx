'use client'

import { useState } from 'react'

interface Reservation {
  id: number
  product_name: string | null
  start_at: string
  price: number | null
  status: 'scheduled' | 'completed' | 'cancelled'
}

interface Customer {
  id: number
  name: string
  phone: string | null
  memo: string | null
  created_at: string
  updated_at: string
  reservations?: Reservation[]
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const fmtPrice = (n: number) => n.toLocaleString() + '원'

const STATUS_LABEL = { scheduled: '예약', completed: '완료', cancelled: '취소' } as const
const STATUS_COLOR = { scheduled: '#ec4899', completed: '#22c55e', cancelled: '#9ca3af' } as const
const STATUS_BG    = { scheduled: '#fdf2f8', completed: '#f0fdf4', cancelled: '#f9fafb' } as const

function calcStats(customer: Customer) {
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

/* ── 고객 상세 ── */
function CustomerDetail({ customer, onClose, onUpdate, onDelete }: {
  customer: Customer; onClose: () => void
  onUpdate: (id: number, data: { name: string; phone: string; memo: string }, merged: Customer) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: customer.name, phone: customer.phone ?? '', memo: customer.memo ?? '' })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const stats = calcStats(customer)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    const merged: Customer = { ...customer, name: form.name, phone: form.phone || null, memo: form.memo || null }
    onUpdate(customer.id, form, merged)
    setSaving(false)
    setEditing(false)
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-pink-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
        <div className="flex items-start justify-between mb-4">
          <div>
            {editing
              ? <input className="text-lg font-700 text-gray-900 border-b-2 border-pink-300 outline-none bg-transparent" value={form.name} onChange={set('name')} />
              : <h2 className="text-lg font-700 text-gray-900">{customer.name}</h2>}
            {editing
              ? <input className="text-xs text-gray-400 border-b border-gray-200 outline-none bg-transparent mt-0.5 w-40" placeholder="연락처" value={form.phone} onChange={set('phone')} />
              : customer.phone && <p className="text-xs text-gray-400">{customer.phone}</p>}
          </div>
          <div className="flex gap-1">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-100">취소</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs text-white" style={{ background: '#ec4899' }}>{saving ? '...' : '저장'}</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-100">편집</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: '총 방문', value: `${stats.completedCount}회` },
            { label: '예약', value: `${stats.totalCount}건` },
            { label: '취소', value: `${stats.cancelCount}회` },
            { label: '누적 금액', value: stats.totalAmount > 0 ? `${(stats.totalAmount/10000).toFixed(0)}만` : '-' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-2 text-center">
              <p className="text-sm font-700 text-gray-800">{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        {stats.lastVisit && <p className="text-xs text-gray-400 mb-3">마지막 방문: {fmtDate(stats.lastVisit)}</p>}

        {Object.keys(stats.byProduct).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">시술별 횟수</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.byProduct).sort((a,b)=>b[1]-a[1]).map(([name,cnt]) => (
                <span key={name} className="text-xs text-pink-500 bg-pink-50 rounded-full px-2.5 py-1">{name} {cnt}회</span>
              ))}
            </div>
          </div>
        )}

        {editing ? (
          <div className="mb-4">
            <label className={lbl}>메모</label>
            <textarea className={inp} rows={2} value={form.memo} onChange={set('memo')} placeholder="고객 특이사항..." />
          </div>
        ) : customer.memo ? (
          <div className="mb-4 bg-yellow-50 rounded-xl px-3 py-2">
            <p className="text-xs text-yellow-700">📌 {customer.memo}</p>
          </div>
        ) : null}

        {stats.upcoming.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">예정된 예약</p>
            <div className="space-y-1.5">
              {stats.upcoming.map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-pink-50 rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-600 text-gray-700">{r.product_name ?? '(시술 미정)'}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(r.start_at)} {fmtTime(r.start_at)}</p>
                  </div>
                  {r.price != null && <span className="text-xs text-pink-500 font-600">{fmtPrice(r.price)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.past.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">방문 이력</p>
            <div className="space-y-1.5">
              {stats.past.slice(0,10).map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-[10px] font-700 px-2 py-0.5 rounded-full shrink-0" style={{ background: STATUS_BG[r.status], color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  <div className="flex-1">
                    <p className="text-xs text-gray-700">{r.product_name ?? '-'}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(r.start_at)}</p>
                  </div>
                  {r.price != null && <span className="text-xs text-gray-500">{fmtPrice(r.price)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!editing && (
          <div className="pt-2 border-t border-gray-100">
            {confirmDel ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmDel(false)} className="flex-1 py-2 rounded-xl text-sm text-gray-500 bg-gray-100">취소</button>
                <button onClick={() => onDelete(customer.id)} className="flex-1 py-2 rounded-xl text-sm font-700 text-white bg-red-500">정말 삭제</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="w-full py-2 rounded-xl text-xs text-gray-400 hover:text-red-400">고객 삭제</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 고객 추가 폼 ── */
function CustomerForm({ onSave, onCancel }: {
  onSave: (form: { name: string; phone: string; memo: string }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', memo: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-pink-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="text-base font-700 text-gray-900">고객 추가</h2>
        <div>
          <label className={lbl}>고객명 <span className="text-red-400">*</span></label>
          <input className={inp} placeholder="홍길동" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className={lbl}>연락처</label>
          <input className={inp} placeholder="010-0000-0000" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className={lbl}>메모</label>
          <textarea className={inp} rows={2} placeholder="특이사항..." value={form.memo} onChange={set('memo')} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">취소</button>
          <button onClick={() => { if (form.name.trim()) onSave(form) }} disabled={!form.name.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 메인 클라이언트 ── */
type SortKey = 'name' | 'count' | 'amount' | 'cancel'

export default function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)

  /* 낙관적 추가 */
  const handleAdd = (form: { name: string; phone: string; memo: string }) => {
    const tempId = -Date.now()
    const optimistic: Customer = { id: tempId, name: form.name, phone: form.phone || null, memo: form.memo || null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), reservations: [] }
    setCustomers(prev => [...prev, optimistic])
    setShowForm(false)

    fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(r => r.json())
      .then(saved => {
        if (saved.id) setCustomers(prev => prev.map(c => c.id === tempId ? { ...saved, reservations: [] } : c))
        else setCustomers(prev => prev.filter(c => c.id !== tempId))
      })
      .catch(() => setCustomers(prev => prev.filter(c => c.id !== tempId)))
  }

  /* 낙관적 수정 */
  const handleUpdate = (id: number, form: { name: string; phone: string; memo: string }, merged: Customer) => {
    const prev = customers
    setCustomers(list => list.map(c => c.id === id ? merged : c))
    setDetail(merged)

    fetch(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(r => { if (!r.ok) { setCustomers(prev); setDetail(customers.find(c => c.id === id) ?? null) } })
      .catch(() => setCustomers(prev))
  }

  /* 낙관적 삭제 */
  const handleDelete = (id: number) => {
    const prev = customers
    setCustomers(list => list.filter(c => c.id !== id))
    setDetail(null)

    fetch(`/api/customers/${id}`, { method: 'DELETE' })
      .then(r => { if (!r.ok) setCustomers(prev) })
      .catch(() => setCustomers(prev))
  }

  const sorted = [...customers]
    .filter(c => !search || c.name.includes(search) || c.phone?.includes(search))
    .sort((a, b) => {
      const sa = calcStats(a), sb = calcStats(b)
      if (sortKey === 'name')   return a.name.localeCompare(b.name)
      if (sortKey === 'count')  return sb.completedCount - sa.completedCount
      if (sortKey === 'amount') return sb.totalAmount - sa.totalAmount
      if (sortKey === 'cancel') return sb.cancelCount - sa.cancelCount
      return 0
    })

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'name', label: '이름순' },
    { key: 'count', label: '횟수순' },
    { key: 'amount', label: '금액순' },
    { key: 'cancel', label: '취소순' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 pt-5 pb-3">
        <h1 className="text-xl font-900 text-gray-900 mb-3">고객 관리</h1>
        <input
          className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none bg-gray-50 focus:border-purple-300 focus:bg-white transition-colors mb-2"
          placeholder="이름 또는 연락처 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5">
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSortKey(s.key)} className="px-3 py-1 rounded-lg text-xs font-600 transition-colors"
              style={sortKey === s.key ? { background: '#a855f7', color: '#fff' } : { background: '#f3f4f6', color: '#9ca3af' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-sm font-600 text-gray-500">{search ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'}</p>
          </div>
        ) : sorted.map(c => {
          const s = calcStats(c)
          return (
            <button key={c.id} onClick={() => setDetail(c)} className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 text-white shrink-0" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-700 text-gray-800">{c.name}</span>
                  {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                </div>
                <div className="flex gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">방문 {s.completedCount}회</span>
                  {s.totalAmount > 0 && <span className="text-xs text-gray-400">누적 {(s.totalAmount/10000).toFixed(0)}만원</span>}
                  {s.cancelCount > 0 && <span className="text-xs text-red-300">취소 {s.cancelCount}회</span>}
                </div>
                {s.lastVisit && <p className="text-[10px] text-gray-300 mt-0.5">마지막 방문 {fmtDate(s.lastVisit)}</p>}
              </div>
              {s.upcoming.length > 0 && (
                <span className="text-[10px] font-700 text-pink-500 bg-pink-50 rounded-full px-2 py-0.5 shrink-0">예약 {s.upcoming.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {!showForm && !detail && (
        <button onClick={() => setShowForm(true)} className="fixed right-5 bottom-14 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-transform active:scale-90 z-30" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>+</button>
      )}

      {showForm && <CustomerForm onSave={handleAdd} onCancel={() => setShowForm(false)} />}

      {detail && (
        <CustomerDetail
          customer={detail}
          onClose={() => setDetail(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
