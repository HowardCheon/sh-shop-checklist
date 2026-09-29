'use client'

import { useEffect, useRef, useState } from 'react'
import { fits, type Block } from '@/lib/booking/availability'
import { BUFFER_MIN, candidateTimes } from '@/lib/booking/rules'
import { addDays, kstNow, minutesOf, timeOf } from '@/lib/booking/time'

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const DAYS = 14

const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const label = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일 (${WEEK[dow(date)]})`
}

type Res = { id: number; status: string; start_at: string; block_end_at: string }

/* ── 관리자 예약 폼: 날짜 칩 + 시간 그리드 ── */
export default function DateTimePicker({ date, time, durationMin, excludeId, onChange }: {
  date: string
  time: string
  durationMin: number
  excludeId?: number
  onChange: (date: string, time: string) => void
}) {
  const today = kstNow().date
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [manual, setManual] = useState(() => !!time && !!date && !candidateTimes(date).includes(time))
  const calRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // 오늘부터 2주 + (범위 밖의 선택 날짜)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i))
  if (date && !days.includes(date)) days.unshift(date)

  // 선택한 날짜의 예약 블록
  useEffect(() => {
    if (!date) return
    let alive = true
    setBlocks(null)
    const range = `from=${encodeURIComponent(`${date}T00:00:00+09:00`)}&to=${encodeURIComponent(`${date}T23:59:59+09:00`)}`
    fetch(`/api/reservations?${range}`).then(r => r.json()).then((list: Res[]) => {
      if (!alive || !Array.isArray(list)) return
      setBlocks(list.filter(r => r.status !== 'cancelled').map(r => ({ id: r.id, start: r.start_at, blockEnd: r.block_end_at })))
    })
    return () => { alive = false }
  }, [date])

  // 선택한 날짜 칩이 보이도록
  useEffect(() => {
    stripRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [date])

  const slots = candidateTimes(date)
  const isSlot = slots.includes(time)
  const ok = (t: string) => !blocks || fits(date, t, durationMin, blocks, excludeId)
  const conflict = !!time && !!blocks && !fits(date, time, durationMin, blocks, excludeId)
  const nowTime = kstNow().time

  const chip = 'shrink-0 w-14 py-2 rounded-2xl border text-center transition-colors'
  const slotCls = 'py-2 rounded-xl border text-sm transition-colors'

  return (
    <div className="space-y-3">
      {/* 날짜 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-600 text-gray-500">날짜 <span className="text-red-400">*</span></span>
          <span className="text-xs font-700 text-brand-600">{date ? label(date) : ''}</span>
        </div>
        <div className="flex items-stretch gap-1.5">
          <div ref={stripRef} className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 flex-1 [scrollbar-width:none]">
            {days.map(d => {
              const sel = d === date
              const sunday = dow(d) === 0
              return (
                <button key={d} type="button" data-selected={sel} onClick={() => onChange(d, time)}
                  className={`${chip} ${sel ? 'bg-brand-500 border-brand-500 text-white' : sunday ? 'border-gray-100 text-gray-300' : 'border-brand-100 text-gray-700 hover:bg-brand-50'}`}>
                  <span className="block text-[10px] leading-tight">{d === today ? '오늘' : d === addDays(today, 1) ? '내일' : WEEK[dow(d)]}</span>
                  <span className="block text-base font-700 leading-tight">{Number(d.slice(8))}</span>
                  {sunday && !sel && <span className="block text-[9px] leading-none">휴무</span>}
                </button>
              )
            })}
          </div>
          <button type="button" aria-label="달력에서 날짜 선택" onClick={() => calRef.current?.showPicker?.()}
            className="shrink-0 w-11 rounded-2xl border border-brand-100 text-lg hover:bg-brand-50 relative">
            📅
            <input ref={calRef} type="date" value={date} onChange={e => e.target.value && onChange(e.target.value, time)}
              className="absolute inset-0 opacity-0 pointer-events-none" tabIndex={-1} />
          </button>
        </div>
      </div>

      {/* 시간 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-600 text-gray-500">시간 <span className="text-red-400">*</span> <span className="font-400 text-gray-400">({durationMin}분 기준)</span></span>
          <button type="button" onClick={() => setManual(m => !m)} className="text-[11px] text-brand-500 underline">
            {manual ? '버튼으로 선택' : '직접 입력 ›'}
          </button>
        </div>
        {manual ? (
          <input type="time" step={600} value={time} onChange={e => onChange(date, e.target.value)}
            className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-brand-300" />
        ) : slots.length === 0 ? (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center">휴무일이에요. 예약이 필요하면 ‘직접 입력’을 이용하세요.</p>
        ) : (
          <div className={`grid grid-cols-4 gap-1.5 ${blocks ? '' : 'opacity-50'}`}>
            {slots.map(t => {
              const sel = t === time
              const free = ok(t)
              const past = date === today && t < nowTime
              return (
                <button key={t} type="button" onClick={() => free && onChange(date, t)} disabled={!free}
                  className={`${slotCls} ${sel ? 'bg-brand-500 border-brand-500 text-white font-700'
                    : !free ? 'border-dashed border-gray-200 bg-gray-50 text-gray-300'
                    : past ? 'border-gray-100 text-gray-400 hover:bg-brand-50'
                    : 'border-brand-100 text-gray-700 hover:bg-brand-50'}`}>
                  {t}
                  {!free && <span className="block text-[9px] leading-none">마감</span>}
                </button>
              )
            })}
          </div>
        )}
        {time && (
          <p className={`mt-2 text-xs rounded-lg px-3 py-2 ${conflict ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-600'}`}>
            {conflict ? '⚠ 다른 예약과 겹쳐요. ' : '→ '}
            {time} ~ {timeOf(minutesOf(time) + durationMin)} (정리 {timeOf(minutesOf(time) + durationMin + BUFFER_MIN)}까지)
            {!isSlot && !conflict && ' · 직접 입력한 시간'}
          </p>
        )}
      </div>
    </div>
  )
}
