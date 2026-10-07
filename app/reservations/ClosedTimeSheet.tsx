'use client'

import { useEffect, useState } from 'react'
import { candidateTimes } from '@/lib/booking/rules'
import { reservedTimes } from '@/lib/booking/closed-slots'
import type { Block } from '@/lib/booking/availability'

type Res = { id: number; status: string; start_at: string; block_end_at: string }

/* ── 관리자 휴무시간 지정: 30분 칸을 눌러 켜고 끄기 (예약된 칸은 그대로 표시, 선택 불가) ── */
export default function ClosedTimeSheet({ date, onClose, onSaved }: {
  date: string
  onClose: () => void
  onSaved: (times: string[]) => void
}) {
  const slots = candidateTimes(date)
  const [closed, setClosed] = useState<Set<string> | null>(null)
  const [reserved, setReserved] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const range = `from=${encodeURIComponent(`${date}T00:00:00+09:00`)}&to=${encodeURIComponent(`${date}T23:59:59+09:00`)}`
    Promise.all([
      fetch(`/api/closed-slots?date=${date}`).then(r => r.json()),
      fetch(`/api/reservations?${range}`).then(r => r.json()),
    ]).then(([c, list]) => {
      setClosed(new Set(c?.times ?? []))
      const blocks: Block[] = (Array.isArray(list) ? list as Res[] : []).filter(r => r.status !== 'cancelled')
        .map(r => ({ id: r.id, start: r.start_at, blockEnd: r.block_end_at }))
      setReserved(reservedTimes(date, candidateTimes(date), blocks))
    })
  }, [date])

  const toggle = (t: string) => setClosed(prev => {
    const next = new Set(prev)
    if (next.has(t)) next.delete(t)
    else next.add(t)
    return next
  })

  const save = async () => {
    if (!closed) return
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/closed-slots', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, times: [...closed] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? '저장 실패'); return }
      onSaved(data.times)
    } catch {
      setErr('네트워크 오류입니다. 다시 시도하세요')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="font-serif text-lg font-extrabold text-slate-700">휴무 시간</h2>
        <p className="text-xs text-gray-500">{date} · 눌러서 켜고 끄세요. 고객 예약 화면에는 ‘마감’으로 보여요.</p>
        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        {slots.length === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">영업하지 않는 날이에요.</p>
        ) : (
          <div className={`grid grid-cols-4 gap-1.5 ${closed ? '' : 'opacity-50'}`}>
            {slots.map(t => {
              const isReserved = reserved.includes(t)
              const on = !!closed?.has(t)
              return (
                <button key={t} type="button" disabled={!closed || isReserved} onClick={() => toggle(t)}
                  className={`py-2 rounded-xl border text-sm transition-colors ${isReserved
                    ? 'border-dashed border-gray-200 bg-gray-50 text-gray-300'
                    : on ? 'bg-slate-600 border-slate-600 text-white font-700'
                    : 'border-slate-200 text-gray-700 hover:bg-slate-50'}`}>
                  {t}
                  {isReserved && <span className="block text-[9px] leading-none">예약</span>}
                  {on && !isReserved && <span className="block text-[9px] leading-none">휴무시간</span>}
                </button>
              )
            })}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">닫기</button>
          <button onClick={save} disabled={saving || !closed} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white bg-slate-600 disabled:opacity-40">
            {saving ? '저장 중...' : `저장${closed ? ` (${closed.size}칸)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
