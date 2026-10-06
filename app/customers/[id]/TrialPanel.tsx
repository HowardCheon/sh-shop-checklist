'use client'

import { useCallback, useEffect, useState } from 'react'
import { splitDeduction } from '@/lib/booking/prepaid'
import { TRIAL_PACKAGES, SPECIAL_CARES, kstToday, trialStatus, type TrialCode, type TrialPackageRow, type TrialUseRow } from '@/lib/booking/trial'
import { fmtDate, fmtPrice } from '../customer-utils'

type Method = 'card' | 'cash' | 'transfer'
const METHODS: { value: Method; label: string }[] = [
  { value: 'card', label: '카드' },
  { value: 'cash', label: '현금' },
  { value: 'transfer', label: '계좌이체' },
]
const CODES = Object.keys(TRIAL_PACKAGES) as TrialCode[]

const dots = (used: number, total: number) => '●'.repeat(used) + '○'.repeat(total - used)

/* ── 첫체험 패키지: 등록(결제) / 사용 / 사용 취소 / 등록 취소 ── */
export default function TrialPanel({ customerId, refreshKey, onChanged }: { customerId: number; refreshKey: number; onChanged: () => void }) {
  const [pkg, setPkg] = useState<TrialPackageRow | null>(null)
  const [uses, setUses] = useState<TrialUseRow[]>([])
  const [balance, setBalance] = useState({ cash: 0, bonus: 0 })
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [reg, setReg] = useState<{ code: TrialCode; usePrepaid: boolean; method: Method; price: string; editPrice: boolean } | null>(null)
  // 등록 후 금액 수정
  const [priceEdit, setPriceEdit] = useState<{ value: string; method: Method | null } | null>(null)
  const [special, setSpecial] = useState<{ care: string; memo: string } | null>(null)
  const [showUses, setShowUses] = useState(false)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/trial`)
    if (!res.ok) return
    const data = await res.json()
    setPkg(data.package)
    setUses(data.uses)
    setBalance({ cash: data.balance.prepaid_cash, bonus: data.balance.prepaid_bonus })
    setLoaded(true)
  }, [customerId])

  useEffect(() => { reload() }, [reload, refreshKey])

  const post = async (key: string, url: string, body: object = {}, method: 'POST' | 'PATCH' = 'POST') => {
    setBusy(key); setErr('')
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(data.error ?? '처리에 실패했습니다')
        await reload() // 다른 기기·탭에서 바뀐 상태 반영
        return false
      }
      await reload()
      onChanged()
      return true
    } catch {
      setErr('네트워크 오류입니다. 다시 시도하세요')
      return false
    } finally {
      setBusy(null)
    }
  }

  const openRegister = async (code: TrialCode) => {
    if (reg?.code === code) { setReg(null); return }
    await reload() // 선불 잔액 최신화
    setReg({ code, usePrepaid: false, method: 'card', price: String(TRIAL_PACKAGES[code].price), editPrice: false })
  }

  if (!loaded) return null

  const hasBalance = balance.cash + balance.bonus > 0
  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none bg-white focus:border-brand-300"
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-600 border ${on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-brand-100 text-brand-600'}`

  /* 미등록 — 패키지 선택 → 결제 입력 → 등록 */
  if (!pkg) {
    const def = reg ? TRIAL_PACKAGES[reg.code] : null
    const usePrepaid = !!reg?.usePrepaid && hasBalance
    const price = reg ? Number(reg.price) : 0
    const priceValid = Number.isInteger(price) && price >= 1
    const split = def && usePrepaid ? splitDeduction(price, balance.cash, balance.bonus) : { cash: 0, bonus: 0, other: price }

    const handleRegister = async () => {
      if (!reg || !def) return
      if (!priceValid) { setErr('금액을 1원 이상으로 입력하세요'); return }
      const ok = await post('register', `/api/customers/${customerId}/trial`, {
        code: reg.code, use_prepaid: usePrepaid, other_method: split.other > 0 ? reg.method : null, price,
      })
      if (ok) setReg(null)
    }

    return (
      <div className="bg-white/85 rounded-2xl border border-brand-100 p-3 mb-4">
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{err}</p>}
        <div className="flex items-center justify-between">
          <p className="text-xs font-700 text-gray-400">첫체험 패키지</p>
          <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">미등록</span>
        </div>
        <div className="flex gap-1.5 mt-2">
          {CODES.map(code => {
            const d = TRIAL_PACKAGES[code]
            return (
              <button key={code} onClick={() => openRegister(code)} disabled={busy !== null}
                className={`flex-1 py-1.5 rounded-lg text-xs font-600 border disabled:opacity-40 ${reg?.code === code ? 'bg-brand-500 border-brand-500 text-white' : 'text-brand-600 bg-brand-50 border-brand-100'}`}>
                {d.basic + d.special}회 {fmtPrice(d.price)}
                <span className={`block text-[9px] ${reg?.code === code ? 'text-white/80' : 'text-brand-400'}`}>베이직 {d.basic} + 스페셜 {d.special} · {d.months}개월</span>
              </button>
            )
          })}
        </div>

        {reg && def && (
          <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-2">
            {/* 금액을 누르면 수정 */}
            {reg.editPrice ? (
              <input type="number" inputMode="numeric" autoFocus className={inp} value={reg.price}
                onChange={e => setReg({ ...reg, price: e.target.value })} onBlur={() => setReg({ ...reg, editPrice: false })} />
            ) : (
              <button type="button" onClick={() => setReg({ ...reg, editPrice: true })} className="w-full flex items-center justify-between text-xs text-gray-600">
                <span>결제 금액</span>
                <span className="font-700 text-brand-700 underline decoration-dotted">{priceValid ? fmtPrice(price) : '금액 입력'} ✎</span>
              </button>
            )}
            {hasBalance && (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={reg.usePrepaid} onChange={e => setReg({ ...reg, usePrepaid: e.target.checked })} />
                선불 사용 (잔액 {fmtPrice(balance.cash + balance.bonus)})
              </label>
            )}
            {usePrepaid && (
              <p className="text-[11px] text-gray-500">선불 차감 실제 {fmtPrice(split.cash)} · 보너스 {fmtPrice(split.bonus)}</p>
            )}
            {split.other > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1">{usePrepaid ? '부족분' : '결제'} {fmtPrice(split.other)} 결제수단</p>
                <div className="flex gap-1.5">
                  {METHODS.map(m => (
                    <button key={m.value} onClick={() => setReg({ ...reg, method: m.value })} className={chip(reg.method === m.value)}>{m.label}</button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleRegister} disabled={busy !== null} className="w-full py-2 rounded-lg text-xs font-700 text-white disabled:opacity-40" style={{ background: '#bc7659' }}>
              {busy === 'register' ? '처리 중...' : `${def.label} 등록 · ${priceValid ? fmtPrice(price) : '-'}`}
            </button>
          </div>
        )}
      </div>
    )
  }

  /* 등록 — 남은 횟수 / 사용 / 내역 / 등록 취소 */
  const label = TRIAL_PACKAGES[pkg.package_code as TrialCode]?.label ?? pkg.package_code
  const st = trialStatus(pkg, kstToday())
  const activeUses = uses.filter(u => u.status === 'used')
  const expiredNote = st.expired ? '만료된 패키지입니다. 그래도 ' : ''

  const useBasic = () => {
    if (!confirm(`${expiredNote}베이직 케어 1회를 차감할까요?`)) return
    post('basic', `/api/trial/${pkg.id}/use`, { kind: 'basic' })
  }

  const useSpecial = async () => {
    if (!special?.care) return
    if (!confirm(`${expiredNote}스페셜 케어(${special.care}) 1회를 차감할까요?`)) return
    const ok = await post('special', `/api/trial/${pkg.id}/use`, { kind: 'special', care_name: special.care, memo: special.memo })
    if (ok) setSpecial(null)
  }

  const cancelUse = (u: TrialUseRow) => {
    if (!confirm(`${fmtDate(u.created_at)} ${u.kind === 'basic' ? '베이직' : `스페셜 - ${u.care_name}`} 사용을 취소할까요? 횟수가 복원됩니다.`)) return
    post(`use-${u.id}`, `/api/trial/uses/${u.id}/cancel`)
  }

  const savePrice = async () => {
    if (!priceEdit) return
    const value = Number(priceEdit.value)
    if (!confirm(`${label} 금액을 ${fmtPrice(pkg.price)} → ${fmtPrice(value)}으로 수정할까요?`)) return
    const ok = await post('price', `/api/trial/${pkg.id}`, { price: value, other_method: priceEdit.method }, 'PATCH')
    if (ok) setPriceEdit(null)
  }

  const cancelPackage = () => {
    if (!confirm(`${label} 등록을 취소할까요? 결제 ${fmtPrice(pkg.price)}도 함께 취소됩니다.`)) return
    post('cancel', `/api/trial/${pkg.id}/cancel`)
  }

  return (
    <div className="bg-white/85 rounded-2xl border border-brand-100 p-3 mb-4">
      {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{err}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs font-700 text-gray-400">첫체험 패키지</p>
        {st.done
          ? <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">사용 완료</span>
          : st.expired
            ? <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-red-500 text-white">기간 만료</span>
            : <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-brand-500 text-white">이용 중</span>}
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <p className="font-serif text-xl font-extrabold text-brand-700">
          {label}
          <button type="button" onClick={() => setPriceEdit(p => p ? null : { value: String(pkg.price), method: null })} className="ml-2 font-sans text-xs font-600 text-gray-500 underline decoration-dotted">
            {fmtPrice(pkg.price)} ✎
          </button>
        </p>
        <p className={`text-[11px] ${st.expired ? 'text-red-400' : 'text-gray-400'}`}>
          ~{pkg.expires_on.replaceAll('-', '.')} {st.expired ? `(${-st.daysLeft}일 지남)` : `(D-${st.daysLeft})`}
        </p>
      </div>

      {priceEdit && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-gray-50 p-2">
          <input type="number" inputMode="numeric" autoFocus className={inp} value={priceEdit.value} onChange={e => setPriceEdit({ ...priceEdit, value: e.target.value })} />
          <p className="text-[11px] text-gray-500">결제 기록 금액도 함께 바뀌어요. 선불로 낸 부분은 그대로이고, 늘어난 금액은 아래 결제수단으로 기록돼요(선택).</p>
          <div className="flex gap-1.5">
            {METHODS.map(m => (
              <button key={m.value} type="button" onClick={() => setPriceEdit({ ...priceEdit, method: priceEdit.method === m.value ? null : m.value })} className={chip(priceEdit.method === m.value)}>{m.label}</button>
            ))}
          </div>
          <button onClick={savePrice} disabled={busy !== null || !(Number(priceEdit.value) >= 0) || priceEdit.value === ''} className="w-full py-2 rounded-lg text-xs font-700 text-white disabled:opacity-40" style={{ background: '#bc7659' }}>
            {busy === 'price' ? '처리 중...' : `금액을 ${fmtPrice(Number(priceEdit.value) || 0)}으로 수정`}
          </button>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-10 font-600">베이직</span>
          <span className="text-brand-400 tracking-wider">{dots(pkg.basic_used, pkg.basic_total)}</span>
          <span className="flex-1 text-gray-400">남은 {st.basicLeft}/{pkg.basic_total}</span>
          {st.basicLeft > 0 && (
            <button onClick={useBasic} disabled={busy !== null} className="px-2.5 py-1 rounded-lg text-xs font-600 text-brand-600 bg-brand-50 border border-brand-100 disabled:opacity-40">
              {busy === 'basic' ? '...' : '베이직 사용'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-10 font-600">스페셜</span>
          <span className="text-brand-400 tracking-wider">{dots(pkg.special_used, pkg.special_total)}</span>
          <span className="flex-1 text-gray-400">남은 {st.specialLeft}/{pkg.special_total}</span>
          {st.specialLeft > 0 && (
            <button onClick={() => setSpecial(s => s ? null : { care: '', memo: '' })} disabled={busy !== null} className="px-2.5 py-1 rounded-lg text-xs font-600 text-brand-600 bg-brand-50 border border-brand-100 disabled:opacity-40">
              스페셜 사용 {special ? '▴' : '▾'}
            </button>
          )}
        </div>
      </div>

      {special && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-gray-50 p-2">
          <div className="flex flex-wrap gap-1.5">
            {SPECIAL_CARES.map(c => (
              <button key={c} onClick={() => setSpecial({ ...special, care: c })} className={chip(special.care === c)}>{c}</button>
            ))}
          </div>
          <input className={inp} placeholder="메모 (선택)" value={special.memo} onChange={e => setSpecial({ ...special, memo: e.target.value })} />
          <button onClick={useSpecial} disabled={busy !== null || !special.care} className="w-full py-2 rounded-lg text-xs font-700 text-white disabled:opacity-40" style={{ background: '#bc7659' }}>
            {busy === 'special' ? '처리 중...' : special.care ? `스페셜 - ${special.care} 1회 차감` : '시술을 선택하세요'}
          </button>
        </div>
      )}

      {uses.length > 0 && (
        <button onClick={() => setShowUses(v => !v)} className="w-full text-[11px] text-brand-500 mt-2">
          {showUses ? '사용 내역 접기 ▲' : `사용 내역 보기 (${activeUses.length}) ▼`}
        </button>
      )}

      {showUses && (
        <div className="mt-2 space-y-1">
          {uses.map(u => (
            <div key={u.id} className={`flex items-center gap-2 text-[11px] ${u.status === 'cancelled' ? 'text-gray-300 line-through' : 'text-gray-600'}`}>
              <span className="shrink-0 text-gray-300">{fmtDate(u.created_at)}</span>
              <span className="flex-1">{u.kind === 'basic' ? '베이직' : `스페셜 - ${u.care_name}`}{u.memo ? ` · ${u.memo}` : ''}</span>
              {u.status === 'used' && (
                <button onClick={() => cancelUse(u)} disabled={busy !== null} className="shrink-0 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5">취소</button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeUses.length === 0 && (
        <button onClick={cancelPackage} disabled={busy !== null} className="w-full mt-2 text-[11px] text-gray-400 hover:text-red-400">
          {busy === 'cancel' ? '...' : '등록 취소'}
        </button>
      )}
    </div>
  )
}
