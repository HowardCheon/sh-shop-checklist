'use client'

import { useState } from 'react'

type Option = { id: number; name: string; phone: string | null }

/* 소개자 선택 — 이름/연락처 검색 후 고르기 */
export default function ReferrerPicker({ customers, excludeId, value, onChange, inputClass }: {
  customers: Option[]
  excludeId?: number
  value: Option | null
  onChange: (c: Option | null) => void
  inputClass: string
}) {
  const [q, setQ] = useState('')
  const term = q.trim()
  const digits = term.replace(/\D/g, '')
  const matches = term
    ? customers.filter(c => c.id > 0 && c.id !== excludeId && (c.name.includes(term) || (digits.length >= 2 && c.phone?.replace(/\D/g, '').includes(digits)))).slice(0, 6)
    : []

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
        <span className="text-sm text-brand-700 font-600">{value.name} {value.phone && <span className="text-xs text-gray-400 font-normal">{value.phone}</span>}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-400">해제</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input className={inputClass} placeholder="소개해 준 고객 이름 또는 연락처" value={q} onChange={e => setQ(e.target.value)} />
      {matches.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-xl border border-brand-100 shadow-lg overflow-hidden">
          {matches.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => { onChange(c); setQ('') }} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-50">
                {c.name} {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {term && matches.length === 0 && <p className="text-[11px] text-gray-400 mt-1">검색 결과가 없습니다</p>}
    </div>
  )
}
