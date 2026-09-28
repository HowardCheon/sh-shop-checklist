'use client'

import { useEffect, useState } from 'react'
import { splitDeduction } from '@/lib/booking/prepaid'

type Method = 'card' | 'cash' | 'transfer'
const METHODS: { value: Method; label: string }[] = [
  { value: 'card', label: '카드' },
  { value: 'cash', label: '현금' },
  { value: 'transfer', label: '계좌이체' },
]
const won = (n: number) => n.toLocaleString() + '원'

/* ── 시술 완료 결제 시트 ── */
export default function PaymentSheet({ reservation, onDone, onCancel }: {
  reservation: { id: number; customer_id: number | null; customer_name: string; product_name: string | null; price: number | null }
  onDone: () => void
  onCancel: () => void
}) {
  const [balance, setBalance] = useState<{ cash: number; bonus: number } | null>(null)
  const [amount, setAmount] = useState(String(reservation.price ?? ''))
  const [usePrepaid, setUsePrepaid] = useState(false)
  const [method, setMethod] = useState<Method>('card')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // 고객 선불 잔액 조회
  useEffect(() => {
    if (!reservation.customer_id) return
    fetch(`/api/customers/${reservation.customer_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(c => {
        if (!c) return
        const b = { cash: c.prepaid_cash ?? 0, bonus: c.prepaid_bonus ?? 0 }
        setBalance(b)
        if (b.cash + b.bonus > 0) setUsePrepaid(true)
      })
  }, [reservation.customer_id])

  const value = Number(amount) || 0
  const split = usePrepaid && balance ? splitDeduction(value, balance.cash, balance.bonus) : { cash: 0, bonus: 0, other: value }
  const hasBalance = !!balance && balance.cash + balance.bonus > 0

  const submit = async () => {
    if (amount === '' || value < 0) { setErr('결제 금액을 입력하세요'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/reservations/${reservation.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: value, use_prepaid: usePrepaid && hasBalance, other_method: split.other > 0 ? method : null, memo: memo || null }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setErr(data.error ?? '처리 실패'); return }
    onDone()
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-brand-700">시술 완료 · 결제</h2>
        <p className="text-xs text-gray-500">{reservation.customer_name} · {reservation.product_name ?? '시술'}</p>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

        <div>
          <label className={lbl}>결제 금액 (원)</label>
          <input type="number" className={inp} value={amount} onChange={e => setAmount(e.target.value)} />
        </div>

        {hasBalance && balance && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 space-y-1.5">
            <label className="flex items-center justify-between">
              <span className="text-xs font-700 text-brand-700">선불 사용 (잔액 {won(balance.cash + balance.bonus)})</span>
              <input type="checkbox" checked={usePrepaid} onChange={e => setUsePrepaid(e.target.checked)} className="w-4 h-4 accent-[#bc7659]" />
            </label>
            <p className="text-[11px] text-gray-400">실제 {won(balance.cash)} · 보너스 {won(balance.bonus)}</p>
            {usePrepaid && (
              <p className="text-[11px] text-brand-600">
                차감 예정: 실제 {won(split.cash)} + 보너스 {won(split.bonus)} (잔액 비율)
              </p>
            )}
          </div>
        )}
        {!reservation.customer_id && <p className="text-[11px] text-gray-400">고객이 연결되지 않은 예약이라 선불을 사용할 수 없습니다.</p>}

        {split.other > 0 && (
          <div>
            <label className={lbl}>{usePrepaid && hasBalance ? `부족분 ${won(split.other)} 결제수단` : '결제수단'}</label>
            <div className="flex gap-1.5">
              {METHODS.map(m => (
                <button key={m.value} onClick={() => setMethod(m.value)} className="flex-1 py-2 rounded-xl text-xs font-600 border transition-colors"
                  style={method === m.value ? { background: '#bc7659', color: '#fff', borderColor: '#bc7659' } : { color: '#a5624a', borderColor: '#f3e6de' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={lbl}>메모</label>
          <input className={inp} value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">닫기</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: '#7c9a7e' }}>
            {saving ? '처리 중...' : `${won(value)} 완료 처리`}
          </button>
        </div>
      </div>
    </div>
  )
}
