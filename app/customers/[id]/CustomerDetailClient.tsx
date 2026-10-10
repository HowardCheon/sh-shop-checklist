'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PrepaidPanel from './PrepaidPanel'
import TrialPanel from './TrialPanel'
import ReferralPanel from './ReferralPanel'
import ReservationForm, { EMPTY_FORM, saveReservation, type Product, type PaymentMethod } from '../../reservations/ReservationForm'
import { isoToKst } from '@/lib/booking/time'
import { calcStats, fmtDate, fmtTime, fmtPrice, STATUS_LABEL, STATUS_COLOR, STATUS_BG, type Customer, type CustomerHistory, type Reservation } from '../customer-utils'


/* ── 고객 상세 페이지 ── */
export default function CustomerDetailClient({ initialCustomer, initialHistory, products }: { initialCustomer: Customer; initialHistory: CustomerHistory[]; products: Product[] }) {
  const router = useRouter()
  const [customer, setCustomer] = useState(initialCustomer)
  // 방문 이력 수정 후 서버에서 새로 받은 데이터 반영
  useEffect(() => { setCustomer(initialCustomer) }, [initialCustomer])
  const [editResv, setEditResv] = useState<Reservation | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: initialCustomer.name, phone: initialCustomer.phone ?? '', memo: initialCustomer.memo ?? '' })
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [delText, setDelText] = useState('')
  const [history, setHistory] = useState(initialHistory)
  useEffect(() => { setHistory(initialHistory) }, [initialHistory])
  const stats = calcStats(customer)
  const onHistory = useCallback((h: CustomerHistory[]) => setHistory(h), [])
  // 선불·첫체험 카드가 서로의 변경(잔액·이력)을 반영하도록 상대 카드 재조회
  const [prepaidKey, setPrepaidKey] = useState(0)
  const [trialKey, setTrialKey] = useState(0)
  const onTrialChanged = useCallback(() => setPrepaidKey(k => k + 1), [])
  const onPrepaidChanged = useCallback(() => setTrialKey(k => k + 1), [])
  const onReferralChanged = useCallback(() => setPrepaidKey(k => k + 1), []) // 고객 이력 갱신

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const [err, setErr] = useState('')

  const handleSave = async () => {
    if (!form.name.trim()) { setErr('고객명을 입력하세요'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/customers/${customer.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    if (!res.ok) { setErr('수정에 실패했습니다'); return }
    const saved = await res.json()
    setCustomer(c => ({ ...c, ...saved }))
    setEditing(false)
  }

  const handleDelete = async () => {
    if (delText.trim() !== '삭제') return
    const res = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' })
    if (!res.ok) { setErr('삭제에 실패했습니다'); setConfirmDel(false); setDelText(''); return }
    router.replace('/customers')
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="min-h-screen">
      <div className="bg-white/60 backdrop-blur border-b border-brand-100 px-4 pt-5 pb-3 flex items-center gap-2">
        <button onClick={() => router.push('/customers')} className="w-8 h-8 rounded-full border border-brand-200 flex items-center justify-center text-brand-500" aria-label="고객 목록으로">‹</button>
        <h1 className="font-serif text-lg font-extrabold text-brand-700">고객 상세</h1>
      </div>
      <div className="px-4 pt-5 pb-24 max-w-lg mx-auto">
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</p>}
        <div className="flex items-start justify-between mb-4">
          <div>
            {editing
              ? <input className="text-lg font-700 text-gray-900 border-b-2 border-brand-300 outline-none bg-transparent" value={form.name} onChange={set('name')} />
              : <h2 className="font-serif text-2xl font-extrabold text-brand-700">{customer.name}</h2>}
            {editing
              ? <input className="text-xs text-gray-400 border-b border-gray-200 outline-none bg-transparent mt-0.5 w-40" placeholder="연락처" value={form.phone} onChange={set('phone')} />
              : customer.phone && <p className="text-xs text-gray-400">{customer.phone}</p>}
          </div>
          <div className="flex gap-1">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setForm({ name: customer.name, phone: customer.phone ?? '', memo: customer.memo ?? '' }) }} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-100">취소</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs text-white" style={{ background: '#bc7659' }}>{saving ? '...' : '저장'}</button>
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
            <div key={s.label} className="bg-white/85 rounded-xl p-2 text-center border border-brand-100">
              <p className="text-sm font-700 text-gray-800">{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>

        <PrepaidPanel customerId={customer.id} initialCash={customer.prepaid_cash ?? 0} initialBonus={customer.prepaid_bonus ?? 0} onHistory={onHistory} refreshKey={prepaidKey} onChanged={onPrepaidChanged} />
        <TrialPanel customerId={customer.id} refreshKey={trialKey} onChanged={onTrialChanged} />
        <ReferralPanel customerId={customer.id} refreshKey={prepaidKey} onChanged={onReferralChanged} />

        {stats.lastVisit && <p className="text-xs text-gray-400 mb-3">마지막 방문: {fmtDate(stats.lastVisit)}</p>}

        {Object.keys(stats.byProduct).length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">시술별 횟수</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stats.byProduct).sort((a,b)=>b[1]-a[1]).map(([name,cnt]) => (
                <span key={name} className="text-xs text-brand-500 bg-brand-50 rounded-full px-2.5 py-1">{name} {cnt}회</span>
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
                <button key={r.id} type="button" onClick={() => setEditResv(r)} className="w-full text-left flex items-center gap-2 bg-brand-50 rounded-xl px-3 py-2 active:bg-brand-100">
                  <div className="flex-1">
                    <p className="text-xs font-600 text-gray-700">{r.product_name ?? '(시술 미정)'}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(r.start_at)} {fmtTime(r.start_at)}</p>
                  </div>
                  {r.price != null && <span className="text-xs text-brand-500 font-600">{fmtPrice(r.price)}</span>}
                  <span className="text-[10px] text-gray-300">✎</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stats.past.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">방문 이력</p>
            <div className="space-y-1.5">
              {stats.past.slice(0,10).map(r => (
                <button key={r.id} type="button" onClick={() => setEditResv(r)} className="w-full text-left flex items-center gap-2 bg-white/85 rounded-xl px-3 py-2 active:bg-brand-50">
                  <span className="text-[10px] font-700 px-2 py-0.5 rounded-full shrink-0" style={{ background: STATUS_BG[r.status], color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  <div className="flex-1">
                    <p className="text-xs text-gray-700">{r.product_name ?? '-'}</p>
                    <p className="text-[10px] text-gray-400">{fmtDate(r.start_at)}</p>
                  </div>
                  {r.price != null && <span className="text-xs text-gray-500">{fmtPrice(r.price)}</span>}
                  <span className="text-[10px] text-gray-300">✎</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-700 text-gray-400 mb-2">고객 이력</p>
            <div className="space-y-1">
              {history.map(h => (
                <div key={h.id} className="flex gap-2 text-[11px] text-gray-500">
                  <span className="text-gray-300 shrink-0">{fmtDate(h.created_at)} {fmtTime(h.created_at)}</span>
                  <span className={`shrink-0 font-600 ${h.actor === 'external' ? 'text-sky-500' : 'text-brand-400'}`}>{h.actor === 'external' ? '외부' : '매장'}</span>
                  <span>{h.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!editing && (
          <div className="pt-2 border-t border-brand-100">
            {confirmDel ? (
              <div className="space-y-2">
                <p className="text-xs text-red-500">
                  {customer.name} 고객을 삭제합니다. 되돌릴 수 없어요. 확인을 위해 아래에 <b>삭제</b>라고 입력하세요.
                </p>
                <input className={inp} value={delText} onChange={e => setDelText(e.target.value)} placeholder="삭제" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && delText.trim() === '삭제') handleDelete() }} />
                <div className="flex gap-2">
                  <button onClick={() => { setConfirmDel(false); setDelText('') }} className="flex-1 py-2 rounded-xl text-sm text-gray-500 bg-gray-100">취소</button>
                  <button onClick={handleDelete} disabled={delText.trim() !== '삭제'}
                    className="flex-1 py-2 rounded-xl text-sm font-700 text-white bg-red-500 disabled:opacity-30">삭제</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="w-full py-2 rounded-xl text-xs text-gray-400 hover:text-red-400">고객 삭제</button>
            )}
          </div>
        )}
      </div>
      {editResv && (
        <ReservationForm
          editId={editResv.id}
          completed={editResv.status === 'completed'}
          date={isoToKst(editResv.start_at).date}
          products={editResv.product_id && !products.some(p => p.id === editResv.product_id)
            ? [...products, { id: editResv.product_id, name: editResv.product_name ?? '(비활성 시술)', price: editResv.price ?? 0, duration_min: editResv.duration_min ?? 60 }]
            : products}
          initial={{
            ...EMPTY_FORM,
            customer_name: editResv.customer_name ?? customer.name,
            customer_phone: editResv.customer_phone ?? customer.phone ?? '',
            customer_id: String(editResv.customer_id ?? customer.id),
            product_id: editResv.product_id?.toString() ?? '',
            date: isoToKst(editResv.start_at).date,
            time: isoToKst(editResv.start_at).time,
            price: editResv.price?.toString() ?? '',
            memo: editResv.memo ?? '',
          }}
          onCancel={() => setEditResv(null)}
          onSave={async (form: typeof EMPTY_FORM, paymentMethod: PaymentMethod | null) => {
            const allProducts = editResv.product_id && !products.some(p => p.id === editResv.product_id)
              ? [...products, { id: editResv.product_id, name: editResv.product_name ?? '', price: editResv.price ?? 0, duration_min: editResv.duration_min ?? 60 }]
              : products
            const e = await saveReservation({ form, products: allProducts, editId: editResv.id, paymentMethod })
            if (e) return e
            setEditResv(null)
            setPrepaidKey(k => k + 1) // 결제 금액이 바뀌었을 수 있음
            router.refresh()
            return null
          }}
        />
      )}
    </div>
  )
}
