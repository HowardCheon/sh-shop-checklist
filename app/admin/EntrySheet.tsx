'use client'

import { useState } from 'react'
import { EVIDENCE_LABEL, METHOD_LABEL, type Evidence, type EntryRow, type Io, type Method } from '@/lib/ledger/summary'
import type { Category } from '@/lib/ledger/repo'

const LAST_KEY = 'ledger_last' // 마지막 결제수단·증빙 기억
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-600 border ${on ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-brand-100 text-brand-600'}`

/* ── 가계부 직접 입력/수정 (지출·기타 수입) ── */
export default function EntrySheet({ categories, initial, onClose, onSaved }: {
  categories: Category[]
  initial: EntryRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const last = (() => {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as { method?: Method; evidence?: Evidence } } catch { return {} }
  })()
  const [form, setForm] = useState({
    entry_date: initial?.entry_date ?? kstToday(),
    io: (initial?.io ?? 'out') as Io,
    amount: initial ? String(initial.amount) : '',
    category_id: initial?.category.id ?? 0,
    method: (initial ? initial.method : last.method ?? 'card') as Method | null,
    evidence: (initial?.evidence ?? last.evidence ?? 'card') as Evidence,
    vendor: initial?.vendor ?? '',
    memo: initial?.memo ?? '',
    excluded: initial?.excluded ?? false,
    exclude_reason: initial?.exclude_reason ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 사용 많은 순, 숨긴 항목은 지금 선택된 경우만
  const cats = categories
    .filter(c => c.io === form.io && (!c.hidden || c.id === form.category_id))
    .sort((a, b) => b.uses - a.uses || a.sort - b.sort)

  const save = async () => {
    if (!form.category_id) { setErr('항목을 선택하세요'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(initial ? `/api/ledger/entries/${initial.id}` : '/api/ledger/entries', {
        method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), method: form.method, evidence: form.io === 'in' ? 'unknown' : form.evidence }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? '저장 실패'); return }
      if (form.io === 'out') localStorage.setItem(LAST_KEY, JSON.stringify({ method: form.method, evidence: form.evidence }))
      onSaved()
    } catch {
      setErr('네트워크 오류입니다')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial || !confirm('이 내역을 삭제할까요?')) return
    setBusy(true)
    const res = await fetch(`/api/ledger/entries/${initial.id}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) onSaved()
    else setErr('삭제 실패')
  }

  const inp = 'w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300'
  const lbl = 'block text-xs font-600 text-gray-500 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-brand-700">{initial ? '내역 수정' : '지출/수입 입력'}</h2>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-1.5">
          {(['out', 'in'] as const).map(io => (
            <button key={io} type="button" onClick={() => setForm(f => ({ ...f, io, category_id: 0 }))}
              className={`flex-1 py-2 rounded-xl text-sm font-700 border ${form.io === io ? (io === 'out' ? 'bg-red-500 border-red-500 text-white' : 'bg-emerald-500 border-emerald-500 text-white') : 'bg-white border-gray-200 text-gray-500'}`}>
              {io === 'out' ? '지출' : '수입'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>날짜</label>
            <input type="date" className={inp} value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>금액 (원)</label>
            <input type="number" inputMode="numeric" className={inp} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className={lbl}>항목</label>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(c => <button key={c.id} type="button" onClick={() => setForm(f => ({ ...f, category_id: c.id }))} className={chip(form.category_id === c.id)}>{c.name}</button>)}
          </div>
        </div>
        <div>
          <label className={lbl}>결제수단</label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(METHOD_LABEL) as Method[]).map(m => <button key={m} type="button" onClick={() => setForm(f => ({ ...f, method: m }))} className={chip(form.method === m)}>{METHOD_LABEL[m]}</button>)}
          </div>
        </div>
        {form.io === 'out' && (
          <div>
            <label className={lbl}>증빙 (세금 신고용)</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(EVIDENCE_LABEL) as Evidence[]).map(v => <button key={v} type="button" onClick={() => setForm(f => ({ ...f, evidence: v }))} className={chip(form.evidence === v)}>{EVIDENCE_LABEL[v]}</button>)}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>거래처 (선택)</label>
            <input className={inp} value={form.vendor} placeholder="쿠팡, 관리사무소…" onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>메모 (선택)</label>
            <input className={inp} value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.excluded} onChange={e => setForm(f => ({ ...f, excluded: e.target.checked }))} />
          합계에서 제외 (중복·취소 등)
        </label>
        {form.excluded && <input className={inp} value={form.exclude_reason} placeholder="제외 사유" onChange={e => setForm(f => ({ ...f, exclude_reason: e.target.value }))} />}

        <div className="flex gap-2 pt-1">
          {initial
            ? <button onClick={remove} disabled={busy} className="py-2.5 px-4 rounded-xl text-sm font-600 text-red-500 bg-red-50">삭제</button>
            : <button onClick={onClose} className="py-2.5 px-4 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">취소</button>}
          <button onClick={save} disabled={busy || !form.amount} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #bc7659, #cb9175)' }}>
            {busy ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
