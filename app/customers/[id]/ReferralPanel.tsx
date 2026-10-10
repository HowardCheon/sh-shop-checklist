'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ReferrerPicker from '../ReferrerPicker'
import { fmtPrice } from '../customer-utils'
import type { ReferralInfo } from '@/lib/referral-repo'

type Option = { id: number; name: string; phone: string | null }

/* ── 소개: 소개자 지정, 적용 기간(첫 관리 + 1년), 이 고객이 소개한 고객과 누적 보너스 ── */
export default function ReferralPanel({ customerId, refreshKey, onChanged }: { customerId: number; refreshKey: number; onChanged: () => void }) {
  const [info, setInfo] = useState<ReferralInfo | null>(null)
  const [editing, setEditing] = useState(false)
  const [options, setOptions] = useState<Option[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/referral`)
    if (res.ok) setInfo(await res.json())
  }, [customerId])
  useEffect(() => { reload() }, [reload, refreshKey])

  const startEdit = async () => {
    setEditing(true); setErr('')
    if (!options.length) {
      const res = await fetch('/api/customers')
      if (res.ok) setOptions((await res.json()).map((c: Option) => ({ id: c.id, name: c.name, phone: c.phone })))
    }
  }

  const save = async (referrer: Option | null) => {
    if (referrer && !confirm(`${referrer.name}님을 소개자로 지정할까요?\n앞으로 이 고객의 관리 금액 10%가 ${referrer.name}님께 보너스로 적립됩니다 (첫 관리 후 1년간).`)) return
    if (!referrer && !confirm('소개자를 해제할까요?')) return
    setBusy(true); setErr('')
    const res = await fetch(`/api/customers/${customerId}/referral`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referrer_id: referrer?.id ?? null }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(data.error ?? '처리에 실패했습니다'); return }
    setInfo(data)
    setEditing(false)
    onChanged()
  }

  if (!info) return null
  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none bg-white focus:border-brand-300"

  return (
    <div className="bg-white/85 rounded-2xl border border-brand-100 p-3 mb-4">
      {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{err}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs font-700 text-gray-400">소개</p>
        {!editing && !info.locked && (
          <button onClick={startEdit} className="text-[11px] text-brand-500">{info.referrer ? '변경' : '소개자 지정'}</button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <ReferrerPicker customers={options} excludeId={customerId} value={null} onChange={c => c && save(c)} inputClass={inp} />
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} disabled={busy} className="flex-1 py-1.5 rounded-lg text-xs text-gray-500 bg-gray-100">취소</button>
            {info.referrer && <button onClick={() => save(null)} disabled={busy} className="flex-1 py-1.5 rounded-lg text-xs text-red-400 bg-red-50/50 border border-red-100">소개자 해제</button>}
          </div>
        </div>
      ) : info.referrer ? (
        <div className="mt-1 text-sm text-gray-700">
          <Link href={`/customers/${info.referrer.id}`} className="font-600 text-brand-600">{info.referrer.name}</Link>님 소개
          <p className="text-[11px] text-gray-400 mt-0.5">
            {info.window ? `보너스 적용 ${info.window.start} ~ ${info.window.end}` : '첫 관리부터 1년간 관리 금액의 10% 적립'}
            {info.rewarded > 0 && ` · 적립 ${fmtPrice(info.rewarded)}`}
          </p>
          {info.locked && <p className="text-[10px] text-gray-300">보너스가 지급되어 소개자를 바꿀 수 없습니다</p>}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-gray-400">소개자 없음</p>
      )}

      {info.referred.length > 0 && (
        <div className="mt-2 pt-2 border-t border-brand-50">
          <p className="text-[11px] font-700 text-gray-400 mb-1">소개한 고객 {info.referred.length}명 · 누적 보너스 {fmtPrice(info.referred.reduce((s, r) => s + r.rewarded, 0))}</p>
          <ul className="space-y-1">
            {info.referred.map(r => (
              <li key={r.id} className="flex items-center gap-2 text-[11px] text-gray-600">
                <Link href={`/customers/${r.id}`} className="flex-1 text-brand-600">{r.name}</Link>
                <span className="text-gray-400">{r.window ? `~${r.window.end}` : '첫 관리 전'}</span>
                <span className="font-600">{fmtPrice(r.rewarded)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
