'use client'

import { useState, useEffect } from 'react'
import DateTimePicker from './DateTimePicker'
import { isoToKst } from '@/lib/booking/time'

/* ── 예약 추가·수정 폼 — 예약 관리와 고객 상세(방문 이력 수정)에서 공용 ── */

export interface Product {
  id: number
  name: string
  price: number
  member_price?: number | null
  duration_min: number | null
}

interface CustomerOption {
  id: number
  name: string
  phone: string | null
  prepaid_cash: number | null
  prepaid_bonus: number | null
}

export type PaymentMethod = 'card' | 'cash' | 'transfer'
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'card', label: '카드' },
  { value: 'cash', label: '현금' },
  { value: 'transfer', label: '계좌이체' },
]

const prepaidTotal = (c: CustomerOption) => (c.prepaid_cash ?? 0) + (c.prepaid_bonus ?? 0)
const fmtPhone = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : p ?? ''
}
/* 시술가 — 회원이면 회원가 */
const priceFor = (p: Product, member: boolean) => (member ? p.member_price ?? p.price : p.price)

export const EMPTY_FORM = { customer_name: '', customer_phone: '', customer_id: '', product_id: '', date: '', time: '', price: '', memo: '' }

/* ── 예약 폼 ── */
export default function ReservationForm({ initial, products, date, onSave, onCancel, editId, completed }: {
  initial?: typeof EMPTY_FORM; products: Product[]; date: string
  onSave: (form: typeof EMPTY_FORM, paymentMethod: PaymentMethod | null) => Promise<string | null>
  onCancel: () => void; editId?: number
  /** 완료(결제된) 예약 수정 — 금액 변경 시 결제 기록도 수정, 늘어난 금액의 결제수단 선택 */
  completed?: boolean
}) {
  const [form, setForm] = useState(initial ?? { ...EMPTY_FORM, date })
  // 선택한 경우에만 전송 — 안 고르면 기존 결제수단 유지
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [showPicker, setShowPicker] = useState(false)

  // 고객 목록 (선택용)
  useEffect(() => {
    fetch('/api/customers').then(r => r.ok ? r.json() : []).then(list => {
      if (Array.isArray(list)) setCustomers(list.map((c: CustomerOption) => ({
        id: c.id, name: c.name, phone: c.phone, prepaid_cash: c.prepaid_cash, prepaid_bonus: c.prepaid_bonus,
      })))
    })
  }, [])

  const picked = customers.find(c => c.id === Number(form.customer_id))
  const isMember = !!picked && prepaidTotal(picked) > 0

  // 이름·전화번호로 고객 검색 (최대 6명)
  const query = form.customer_name.trim()
  const digits = query.replace(/\D/g, '')
  const matches = !query || picked ? [] : customers.filter(c =>
    c.name.includes(query) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)),
  ).slice(0, 6)

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = e.target.value
      setForm(f => {
        const next = { ...f, [k]: val }
        // 이름·연락처를 직접 고치면 선택한 고객 연결 해제
        if (k === 'customer_name' || k === 'customer_phone') next.customer_id = ''
        // 완료(결제된) 방문은 금액을 자동으로 바꾸지 않음 — 결제 기록이 함께 바뀌므로 직접 입력할 때만
        if (k === 'product_id' && !completed) {
          const p = products.find(p => p.id === Number(val))
          if (p) next.price = priceFor(p, isMember).toString()
        }
        return next
      })
      if (k === 'customer_name') setShowPicker(true)
    }

  const pickCustomer = (c: CustomerOption) => {
    const member = prepaidTotal(c) > 0
    setForm(f => {
      const p = products.find(p => p.id === Number(f.product_id))
      return { ...f, customer_name: c.name, customer_phone: fmtPhone(c.phone), customer_id: String(c.id), price: p && !completed ? priceFor(p, member).toString() : f.price }
    })
    setShowPicker(false)
  }

  const selectedProduct = products.find(p => p.id === Number(form.product_id))

  const handleSave = async () => {
    if (!form.customer_name.trim()) { setErr('고객명을 입력하세요'); return }
    if (!form.date || !form.time)   { setErr('예약 날짜/시간을 선택하세요'); return }
    setSaving(true); setErr('')
    const e = await onSave(form, completed ? method : null)
    if (e) { setErr(e); setSaving(false) }
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-brand-700">{editId ? '예약 수정' : '예약 추가'}</h2>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={lbl}>고객명 <span className="text-red-400">*</span></label>
            <div className="relative">
              <input className={inp} placeholder="이름 또는 전화번호로 검색" value={form.customer_name} onChange={set('customer_name')}
                onFocus={() => setShowPicker(true)} onBlur={() => setTimeout(() => setShowPicker(false), 150)} autoComplete="off" />
              {showPicker && matches.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-brand-100 rounded-xl shadow-lg overflow-hidden">
                  {matches.map(c => (
                    <li key={c.id}>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pickCustomer(c)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-brand-50">
                        <span className="text-sm text-gray-800">{c.name} <span className="text-xs text-gray-400">{fmtPhone(c.phone)}</span></span>
                        {prepaidTotal(c) > 0
                          ? <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 whitespace-nowrap">🌸 회원</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 whitespace-nowrap">비회원</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {picked ? (
              <p className="mt-1 text-[11px] text-brand-600">
                ✓ 등록 고객 선택됨 · {isMember ? `🌸 회원 (선불 잔액 ${prepaidTotal(picked).toLocaleString()}원) — 회원가 적용` : '비회원'}
                <button type="button" onClick={() => setForm(f => ({ ...f, customer_id: '' }))} className="ml-2 text-gray-400 underline">선택 해제</button>
              </p>
            ) : query && (
              <p className="mt-1 text-[11px] text-gray-400">목록에서 고르지 않으면 입력한 연락처로 새 고객으로 등록돼요</p>
            )}
          </div>
          <div className="col-span-2">
            <label className={lbl}>연락처</label>
            <input className={inp} placeholder="010-0000-0000" value={form.customer_phone} onChange={set('customer_phone')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>시술 선택</label>
            <select className={inp} value={form.product_id} onChange={set('product_id')}>
              <option value="">선택 안 함</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.duration_min ? `(${p.duration_min}분)` : ''}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <DateTimePicker date={form.date} time={form.time} durationMin={selectedProduct?.duration_min ?? 60} excludeId={editId}
              onChange={(date, time) => setForm(f => ({ ...f, date, time }))} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>금액 (원)</label>
            <input type="number" className={inp} placeholder="70000" value={form.price} onChange={set('price')} />
          </div>
          {completed && (
            <div className="col-span-2 rounded-xl bg-brand-50/60 border border-brand-100 p-2">
              <p className="text-[11px] text-brand-700 mb-1.5">완료된 방문이에요. 금액을 바꾸면 결제 기록 금액도 함께 수정돼요. 선불 사용분은 그대로이고, 결제수단은 바꿀 때만 고르세요(안 고르면 기존 수단 유지)</p>
              <div className="flex gap-1.5">
                {METHODS.map(m => (
                  <button key={m.value} type="button" onClick={() => setMethod(cur => cur === m.value ? null : m.value)} className="flex-1 py-1.5 rounded-lg text-xs font-600 border"
                    style={method === m.value ? { background: '#bc7659', color: '#fff', borderColor: '#bc7659' } : { color: '#a5624a', borderColor: '#f3e6de' }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="col-span-2">
            <label className={lbl}>내부 메모 <span className="font-400 text-gray-400">(고객에게 보이지 않음)</span></label>
            <textarea className={inp} rows={2} placeholder="특이사항 등..." value={form.memo} onChange={set('memo')} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">취소</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #bc7659, #cb9175)' }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

const fmtTime = (iso: string) => isoToKst(iso).time

/** 예약 저장(추가·수정) — 실패 시 오류 메시지, 성공 시 null */
export async function saveReservation({ form, products, editId, paymentMethod }: {
  form: typeof EMPTY_FORM; products: Product[]; editId?: number; paymentMethod?: PaymentMethod | null
}): Promise<string | null> {
  const start_at = `${form.date}T${form.time}:00+09:00`
  const selectedProduct = products.find(p => p.id === Number(form.product_id))
  const payload = {
    customer_name: form.customer_name,
    customer_phone: form.customer_phone || null,
    customer_id: form.customer_id ? Number(form.customer_id) : null,
    product_id: form.product_id ? Number(form.product_id) : null,
    product_name: selectedProduct?.name ?? null,
    duration_min: selectedProduct?.duration_min ?? 60,
    start_at,
    price: form.price ? Number(form.price) : null,
    memo: form.memo || null,
    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
  }
  const post = (body: object) => fetch(editId ? `/api/reservations/${editId}` : '/api/reservations', {
    method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  let res = await post(payload)
  let data = await res.json().catch(() => ({}))
  // 관리자 휴무시간과 겹치면 확인 후 그대로 저장
  if (res.status === 409 && data.closed_slot) {
    if (!confirm(`휴무시간(${data.closed_slot.start}~${data.closed_slot.end})과 겹칩니다. 그래도 저장할까요?`)) return '휴무시간과 겹쳐 저장하지 않았어요'
    res = await post({ ...payload, allow_closed: true })
    data = await res.json().catch(() => ({}))
  }
  if (!res.ok) {
    if (data.conflict) {
      const c = data.conflict
      return `${c.customer_name}님 예약(${fmtTime(c.start_at)}~${fmtTime(c.end_at)})과 시간이 겹칩니다`
    }
    return data.error ?? '저장 실패'
  }
  return null
}
