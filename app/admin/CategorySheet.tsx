'use client'

import { useState } from 'react'
import type { Category } from '@/lib/ledger/repo'

/* ── 가계부 항목 관리: 추가 · 이름 변경 · 숨김 (기존 내역은 그대로) ── */
export default function CategorySheet({ categories, onClose, onChanged }: { categories: Category[]; onClose: () => void; onChanged: () => void }) {
  const [list, setList] = useState(categories)
  const [newName, setNewName] = useState<{ io: 'in' | 'out'; name: string }>({ io: 'out', name: '' })
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [err, setErr] = useState('')

  const call = async (url: string, method: string, body: object) => {
    setErr('')
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(data.error ?? '저장 실패'); return null }
    onChanged()
    return data as Category
  }

  const add = async () => {
    if (!newName.name.trim()) return
    const c = await call('/api/ledger/categories', 'POST', newName)
    if (c) { setList(l => [...l, { ...c, uses: 0 }]); setNewName(n => ({ ...n, name: '' })) }
  }
  const update = async (id: number, body: { name?: string; hidden?: boolean }) => {
    const c = await call(`/api/ledger/categories/${id}`, 'PUT', body)
    if (c) setList(l => l.map(x => (x.id === id ? { ...x, ...c } : x)))
  }

  const inp = 'flex-1 min-w-0 text-sm rounded-lg border border-gray-200 px-2.5 py-1.5 outline-none focus:border-brand-300'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-brand-700">항목 관리</h2>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        {(['out', 'in'] as const).map(io => (
          <div key={io}>
            <p className="text-xs font-700 text-gray-400 mb-1">{io === 'out' ? '지출' : '수입'}</p>
            <ul className="space-y-1">
              {list.filter(c => c.io === io).map(c => (
                <li key={c.id} className={`flex items-center gap-1.5 ${c.hidden ? 'opacity-50' : ''}`}>
                  {renaming?.id === c.id ? (
                    <>
                      <input className={inp} value={renaming.name} autoFocus onChange={e => setRenaming({ id: c.id, name: e.target.value })} />
                      <button onClick={() => { update(c.id, { name: renaming.name }); setRenaming(null) }} className="text-[11px] px-2 py-1 rounded-lg bg-brand-500 text-white">저장</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-700">{c.name} <span className="text-[10px] text-gray-400">{c.uses}건{c.hidden ? ' · 숨김' : ''}</span></span>
                      <button onClick={() => setRenaming({ id: c.id, name: c.name })} className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500">이름</button>
                      <button onClick={() => update(c.id, { hidden: !c.hidden })} className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500">{c.hidden ? '보이기' : '숨기기'}</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
          <select value={newName.io} onChange={e => setNewName(n => ({ ...n, io: e.target.value as 'in' | 'out' }))} className="text-sm rounded-lg border border-gray-200 px-2 py-1.5">
            <option value="out">지출</option>
            <option value="in">수입</option>
          </select>
          <input className={inp} value={newName.name} placeholder="새 항목 이름" onChange={e => setNewName(n => ({ ...n, name: e.target.value }))} />
          <button onClick={add} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: '#bc7659' }}>추가</button>
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">닫기</button>
      </div>
    </div>
  )
}
