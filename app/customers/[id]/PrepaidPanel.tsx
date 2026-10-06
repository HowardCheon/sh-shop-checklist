'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmtDate, fmtTime, fmtPrice, type CustomerHistory } from '../customer-utils'

const CHARGE_OPTIONS = [
  { amount: 500000, label: '50만', bonus: 0 },
  { amount: 1000000, label: '100만', bonus: 100000 },
  { amount: 2000000, label: '200만', bonus: 250000 },
]
const LEDGER_LABEL: Record<string, string> = { charge: '충전', use: '사용', use_cancel: '사용 취소', refund: '환불' }
const METHOD_LABEL: Record<string, string> = { card: '카드', cash: '현금', transfer: '계좌이체' }

interface LedgerRow {
  id: number
  type: string
  cash_amount: number
  bonus_amount: number
  cash_balance_after: number
  bonus_balance_after: number
  memo: string | null
  created_at: string
}

interface PaymentRow {
  id: number
  reservation_id: number | null
  total_amount: number
  prepaid_cash_used: number
  prepaid_bonus_used: number
  other_method: string | null
  other_amount: number
  status: 'paid' | 'voided'
  memo: string | null
  created_at: string
}

const signed = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString()

/* ── 선불 충전금: 충전 / 직접 차감 / 환불 / 원장 / 결제 내역 ── */
export default function PrepaidPanel({ customerId, initialCash, initialBonus, onHistory, refreshKey }: {
  customerId: number
  initialCash: number
  initialBonus: number
  onHistory: (history: CustomerHistory[]) => void
  refreshKey: number
}) {
  const [cash, setCash] = useState(initialCash)
  const [bonus, setBonus] = useState(initialBonus)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [useForm, setUseForm] = useState<{ amount: string; memo: string } | null>(null)
  const [showLedger, setShowLedger] = useState(false)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/ledger`)
    if (!res.ok) return
    const data = await res.json()
    setCash(data.balance.prepaid_cash)
    setBonus(data.balance.prepaid_bonus)
    setLedger(data.ledger)
    setPayments(data.payments)
    onHistory(data.history)
  }, [customerId, onHistory])

  useEffect(() => { reload() }, [reload, refreshKey])

  const post = async (key: string, url: string, body: object) => {
    setBusy(key); setErr('')
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setErr(data.error ?? '처리에 실패했습니다'); return null }
    await reload()
    return data
  }

  const handleCharge = (opt: typeof CHARGE_OPTIONS[number]) => {
    if (!confirm(`${opt.label}원 충전${opt.bonus ? ` (보너스 ${opt.bonus / 10000}만원)` : ''}을 기록할까요?`)) return
    post(`charge-${opt.amount}`, `/api/customers/${customerId}/charge`, { amount: opt.amount })
  }

  const handleUse = async () => {
    if (!useForm) return
    const ok = await post('use', `/api/customers/${customerId}/use`, { amount: Number(useForm.amount), memo: useForm.memo })
    if (ok) setUseForm(null)
  }

  const handleRefund = () => {
    if (!confirm(`실제 잔액 ${fmtPrice(cash)}을 환불합니다.\n보너스 ${fmtPrice(bonus)}은 소멸되고 비회원으로 전환됩니다. 계속할까요?`)) return
    post('refund', `/api/customers/${customerId}/refund`, {})
  }

  const handleVoid = (p: PaymentRow) => {
    if (!confirm(`${fmtPrice(p.total_amount)} 결제를 취소할까요? 선불 사용분은 잔액으로 복원됩니다.`)) return
    post(`void-${p.id}`, `/api/payments/${p.id}/void`, {})
  }

  const total = cash + bonus
  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none bg-white focus:border-brand-300"

  return (
    <div className="bg-white/85 rounded-2xl border border-brand-100 p-3 mb-4">
      {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{err}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs font-700 text-gray-400">선불 충전금</p>
        <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full ${total > 0 ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
          {total > 0 ? '회원' : '비회원'}
        </span>
      </div>
      <p className="font-serif text-xl font-extrabold text-brand-700 mt-1">{fmtPrice(total)}</p>
      <p className="text-[11px] text-gray-400">실제 {fmtPrice(cash)} · 보너스 {fmtPrice(bonus)}</p>

      <div className="flex gap-1.5 mt-2">
        {CHARGE_OPTIONS.map(opt => (
          <button key={opt.amount} onClick={() => handleCharge(opt)} disabled={busy !== null} className="flex-1 py-1.5 rounded-lg text-xs font-600 text-brand-600 bg-brand-50 border border-brand-100 disabled:opacity-40">
            {busy === `charge-${opt.amount}` ? '...' : `+${opt.label}`}
            {opt.bonus > 0 && <span className="block text-[9px] text-brand-400">보너스 {opt.bonus / 10000}만</span>}
          </button>
        ))}
      </div>

      {total > 0 && (
        <div className="flex gap-1.5 mt-1.5">
          <button onClick={() => setUseForm(f => f ? null : { amount: '', memo: '' })} disabled={busy !== null} className="flex-1 py-1.5 rounded-lg text-xs font-600 text-gray-600 bg-gray-50 border border-gray-200 disabled:opacity-40">직접 차감</button>
          <button onClick={handleRefund} disabled={busy !== null} className="flex-1 py-1.5 rounded-lg text-xs font-600 text-red-400 bg-red-50/50 border border-red-100 disabled:opacity-40">
            {busy === 'refund' ? '...' : '환불'}
          </button>
        </div>
      )}

      {useForm && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-gray-50 p-2">
          <input type="number" className={inp} placeholder="차감 금액" value={useForm.amount} onChange={e => setUseForm({ ...useForm, amount: e.target.value })} />
          <input className={inp} placeholder="사유 (예: 홈케어 제품 구매)" value={useForm.memo} onChange={e => setUseForm({ ...useForm, memo: e.target.value })} />
          <button onClick={handleUse} disabled={busy !== null || !useForm.amount || !useForm.memo.trim()} className="w-full py-2 rounded-lg text-xs font-700 text-white disabled:opacity-40" style={{ background: '#bc7659' }}>
            {busy === 'use' ? '처리 중...' : '잔액 비율로 차감'}
          </button>
        </div>
      )}

      {(ledger.length > 0 || payments.length > 0) && (
        <button onClick={() => setShowLedger(v => !v)} className="w-full text-[11px] text-brand-500 mt-2">
          {showLedger ? '내역 접기 ▲' : `충전·결제 내역 보기 ▼`}
        </button>
      )}

      {showLedger && (
        <div className="mt-2 space-y-3">
          {payments.length > 0 && (
            <div>
              <p className="text-[11px] font-700 text-gray-400 mb-1">결제</p>
              <div className="space-y-1">
                {payments.map(p => (
                  <div key={p.id} className={`flex items-center gap-2 text-[11px] ${p.status === 'voided' ? 'text-gray-300 line-through' : 'text-gray-600'}`}>
                    <span className="shrink-0 text-gray-300 no-underline">{fmtDate(p.created_at)}</span>
                    <span className="flex-1">
                      {fmtPrice(p.total_amount)}
                      {p.prepaid_cash_used + p.prepaid_bonus_used > 0 && ` · 선불 ${(p.prepaid_cash_used + p.prepaid_bonus_used).toLocaleString()}`}
                      {p.other_amount > 0 && p.other_method && ` · ${METHOD_LABEL[p.other_method]} ${p.other_amount.toLocaleString()}`}
                      {!p.reservation_id && ` (${p.memo ?? '직접'})`}
                    </span>
                    {p.status === 'paid' && (
                      <button onClick={() => handleVoid(p)} disabled={busy !== null} className="shrink-0 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5">취소</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {ledger.length > 0 && (
            <div>
              <p className="text-[11px] font-700 text-gray-400 mb-1">선불 원장 (실제 / 보너스)</p>
              <div className="space-y-1">
                {ledger.map(l => (
                  <div key={l.id} className="flex gap-2 text-[11px] text-gray-600">
                    <span className="shrink-0 text-gray-300">{fmtDate(l.created_at)} {fmtTime(l.created_at)}</span>
                    <span className="shrink-0 font-600">{LEDGER_LABEL[l.type] ?? l.type}</span>
                    <span className="flex-1">{signed(l.cash_amount)} / {signed(l.bonus_amount)}</span>
                    <span className="shrink-0 text-gray-400">잔액 {(l.cash_balance_after + l.bonus_balance_after).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
