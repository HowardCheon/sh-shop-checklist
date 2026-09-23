'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import BrandHeader, { PageTitle } from '@/components/BrandHeader'
import { calcStats, fmtDate, type Customer } from './customer-utils'

const FAB = 'linear-gradient(135deg, #bc7659, #cb9175)'

/* ── 고객 추가 폼 ── */
function CustomerForm({ onSave, onCancel }: {
  onSave: (form: { name: string; phone: string; memo: string }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ name: '', phone: '', memo: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-brand-700">고객 추가</h2>
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
          <button onClick={() => { if (form.name.trim()) onSave(form) }} disabled={!form.name.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: FAB }}>
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
  const [showForm, setShowForm] = useState(false)

  // 서버에서 새 목록을 받으면(새로고침·재방문) 동기화
  useEffect(() => { setCustomers(initialCustomers) }, [initialCustomers])

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
    <div className="min-h-screen">
      <BrandHeader>
        <PageTitle title="고객 관리" sub={`등록 고객 ${customers.length}명`} />
        <input
          className="w-full text-sm rounded-full border border-brand-200 px-4 py-2 mt-3 outline-none bg-white/80 placeholder:text-brand-300 focus:border-brand-400 focus:bg-white transition-colors mb-2"
          placeholder="이름 또는 연락처 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 justify-center">
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSortKey(s.key)} className="px-3 py-1 rounded-full text-xs font-600 border transition-colors"
              style={sortKey === s.key ? { background: '#bc7659', borderColor: '#bc7659', color: '#fff' } : { background: '#faf4f0', borderColor: '#f3e6de', color: '#a5624a' }}>
              {s.label}
            </button>
          ))}
        </div>
      </BrandHeader>

      <div className="px-4 py-4 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-center py-14">
            <img src="/onflow-logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-40" />
            <p className="font-serif text-base font-bold text-brand-600">{search ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'}</p>
          </div>
        ) : sorted.map(c => {
          const s = calcStats(c)
          return (
            <Link key={c.id} href={`/customers/${c.id}`} aria-disabled={c.id < 0} onClick={e => { if (c.id < 0) e.preventDefault() }} className="w-full text-left bg-white/85 rounded-2xl border border-brand-100 px-4 py-3 shadow-sm flex items-center gap-3 active:bg-brand-50 transition-colors">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-base font-bold text-brand-600 bg-brand-50 border border-brand-200 shrink-0">
                {c.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-serif text-base font-bold text-brand-800">{c.name}</span>
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
                <span className="text-[10px] font-700 text-brand-500 bg-brand-50 rounded-full px-2 py-0.5 shrink-0">예약 {s.upcoming.length}</span>
              )}
            </Link>
          )
        })}
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="fixed right-5 bottom-14 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-transform active:scale-90 z-30" style={{ background: FAB }}>+</button>
      )}

      {showForm && <CustomerForm onSave={handleAdd} onCancel={() => setShowForm(false)} />}

    </div>
  )
}
