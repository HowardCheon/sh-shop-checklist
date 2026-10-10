'use client'

import { useEffect, useState } from 'react'
import { splitDeduction } from '@/lib/booking/prepaid'
import { SPECIAL_CARES, defaultTrialChoice, kstToday, trialStatus, type TrialKind, type TrialPackageRow } from '@/lib/booking/trial'
import { inReferralWindow, referralReward } from '@/lib/referral'

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
  // 첫체험 차감 — 켜면 결제 금액 0원(수정 가능), 끄면 원래 금액 복원
  const [trialPkg, setTrialPkg] = useState<TrialPackageRow | null>(null)
  const [trialOn, setTrialOn] = useState(false)
  const [trialKind, setTrialKind] = useState<TrialKind>('basic')
  const [trialCare, setTrialCare] = useState('')
  const [amountBeforeTrial, setAmountBeforeTrial] = useState('')

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

  // 고객의 유효 첫체험권 조회
  useEffect(() => {
    if (!reservation.customer_id) return
    fetch(`/api/customers/${reservation.customer_id}/trial`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.package) setTrialPkg(d.package) })
  }, [reservation.customer_id])

  // 소개자 — 적용 기간이면 결제 총액의 10% 적립 안내
  const [referral, setReferral] = useState<{ referrer: { name: string } | null; window: { start: string } | null } | null>(null)
  useEffect(() => {
    if (!reservation.customer_id) return
    fetch(`/api/customers/${reservation.customer_id}/referral`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.referrer) setReferral(d) })
  }, [reservation.customer_id])

  const trialSt = trialPkg ? trialStatus(trialPkg, kstToday()) : null
  const trialAvailable = !!trialSt && !trialSt.done

  const toggleTrial = (on: boolean) => {
    if (!trialSt) return
    setTrialOn(on)
    if (on) {
      const guess = defaultTrialChoice(reservation.product_name)
      const canBasic = trialSt.basicLeft > 0
      const canSpecial = trialSt.specialLeft > 0
      if (guess?.kind === 'special' && canSpecial) { setTrialKind('special'); setTrialCare(guess.care) }
      else if (guess?.kind === 'basic' && canBasic) { setTrialKind('basic'); setTrialCare('') }
      else { setTrialKind(canBasic ? 'basic' : 'special'); setTrialCare('') }
      setAmountBeforeTrial(amount)
      setAmount('0')
    } else {
      setAmount(amountBeforeTrial || String(reservation.price ?? ''))
    }
  }
  const trialLabel = trialKind === 'basic' ? '베이직' : `스페셜${trialCare ? ` - ${trialCare}` : ''}`

  const value = Number(amount) || 0
  const split = usePrepaid && balance ? splitDeduction(value, balance.cash, balance.bonus) : { cash: 0, bonus: 0, other: value }
  const hasBalance = !!balance && balance.cash + balance.bonus > 0
  const referralBonus = referral?.referrer && inReferralWindow(referral.window?.start ?? null, kstToday()) ? referralReward(value) : 0

  const submit = async () => {
    if (amount === '' || value < 0) { setErr('결제 금액을 입력하세요'); return }
    if (trialOn && trialKind === 'special' && !trialCare) { setErr('첫체험 스페셜 케어 시술을 선택하세요'); return }
    if (trialOn && trialSt?.expired && !confirm('만료된 첫체험권입니다. 그래도 차감할까요?')) return
    setSaving(true); setErr('')
    const res = await fetch(`/api/reservations/${reservation.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: value, use_prepaid: usePrepaid && hasBalance, other_method: split.other > 0 ? method : null, memo: memo || null,
        ...(trialOn && trialPkg ? { trial: { package_id: trialPkg.id, kind: trialKind, care_name: trialKind === 'special' ? trialCare : null } } : {}),
      }),
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

        {trialAvailable && trialSt && trialPkg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <label className="flex items-center justify-between">
              <span className="text-xs font-700 text-amber-800">
                🎁 첫체험 사용 (베이직 {trialSt.basicLeft} · 스페셜 {trialSt.specialLeft} 남음{trialSt.expired ? ' · 기간 만료' : ''})
              </span>
              <input type="checkbox" checked={trialOn} onChange={e => toggleTrial(e.target.checked)} className="w-4 h-4 accent-[#bc7659]" />
            </label>
            {trialOn && (
              <>
                <div className="flex gap-1.5">
                  {(['basic', 'special'] as const).map(k => {
                    const left = k === 'basic' ? trialSt.basicLeft : trialSt.specialLeft
                    return (
                      <button key={k} type="button" disabled={left === 0} onClick={() => { setTrialKind(k); if (k === 'basic') setTrialCare('') }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-600 border disabled:opacity-30"
                        style={trialKind === k ? { background: '#bc7659', color: '#fff', borderColor: '#bc7659' } : { color: '#a5624a', borderColor: '#f3e6de', background: '#fff' }}>
                        {k === 'basic' ? '베이직' : '스페셜'} ({left})
                      </button>
                    )
                  })}
                </div>
                {trialKind === 'special' && (
                  <div className="flex flex-wrap gap-1.5">
                    {SPECIAL_CARES.map(c => (
                      <button key={c} type="button" onClick={() => setTrialCare(c)} className="px-2.5 py-1 rounded-full text-xs font-600 border"
                        style={trialCare === c ? { background: '#bc7659', color: '#fff', borderColor: '#bc7659' } : { color: '#a5624a', borderColor: '#f3e6de', background: '#fff' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-amber-700">첫체험권은 이미 결제된 상품이라 결제 금액을 0원으로 바꿨어요. 추가 비용이 있으면 금액을 고쳐 주세요.</p>
              </>
            )}
          </div>
        )}

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

        {referralBonus > 0 && referral?.referrer && (
          <p className="text-[11px] text-brand-600 bg-brand-50/60 rounded-lg px-3 py-2">🤝 소개자 {referral.referrer.name}님께 소개 보너스 {won(referralBonus)} 적립</p>
        )}

        <div>
          <label className={lbl}>메모</label>
          <input className={inp} value={memo} onChange={e => setMemo(e.target.value)} placeholder="선택" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">닫기</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: '#7c9a7e' }}>
            {saving ? '처리 중...' : `${won(value)} 완료 처리${trialOn ? ` · 첫체험 ${trialLabel}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
