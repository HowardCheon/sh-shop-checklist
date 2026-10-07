'use client'

import { useEffect, useRef, useState } from 'react'
import { fits, type Block } from '@/lib/booking/availability'
import { closedBlocks } from '@/lib/booking/closed-slots'
import { BUFFER_MIN, candidateTimes } from '@/lib/booking/rules'
import { addDays, kstNow, minutesOf, timeOf } from '@/lib/booking/time'
import { MINUTES, fromParts, outsideHours, toParts, type AmPm } from '@/lib/booking/manual-time'

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
  // 관리자 휴무시간 블록 — 선택은 가능하지만 '휴무시간'으로 표시
  const [closedB, setClosedB] = useState<Block[]>([])
  // '다른 시간' 입력 — 버튼에 없는 시각(영업시간 외 등)
  const [showOther, setShowOther] = useState(() => !!date && (!candidateTimes(date).length || (!!time && !candidateTimes(date).includes(time))))
  const [other, setOtherState] = useState(() => toParts(time))
  const setOther = (next: { ampm: AmPm; hour: number; minute: number }) => {
    setOtherState(next)
    onChange(date, fromParts(next.ampm, next.hour, next.minute))
  }
  // 휴무일(시간 버튼 없음)로 바꾸면 '다른 시간'을 바로 펼침
  useEffect(() => {
    if (date && candidateTimes(date).length === 0) setShowOther(true)
  }, [date])

  // 열면 지금 고른 오전/오후·시·분을 바로 적용, 다른 시간이 선택돼 있지 않을 때만 다시 눌러 닫기
  const openOther = () => {
    const manualPicked = !!time && !candidateTimes(date).includes(time)
    if (!showOther) { setShowOther(true); setOther(other) }
    else if (!manualPicked) setShowOther(false)
  }
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
    fetch(`/api/closed-slots?date=${date}`).then(r => r.ok ? r.json() : { times: [] }).then(c => {
      if (alive) setClosedB(closedBlocks(date, c?.times ?? []))
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
  const inClosed = (t: string) => !fits(date, t, durationMin, closedB)
  const closedConflict = !!time && !conflict && inClosed(time)
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
        <div className="mb-1">
          <span className="text-xs font-600 text-gray-500">시간 <span className="text-red-400">*</span> <span className="font-400 text-gray-400">({durationMin}분 기준)</span></span>
        </div>
        {slots.length === 0 && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-3 text-center mb-1.5">휴무일이에요. 예약이 필요하면 ‘다른 시간’으로 입력하세요.</p>
        )}
        <div className={`grid grid-cols-4 gap-1.5 ${blocks ? '' : 'opacity-50'}`}>
          {slots.map(t => {
            const sel = t === time
            const free = ok(t)
            const past = date === today && t < nowTime
            const closedT = free && inClosed(t)
            return (
              <button key={t} type="button" onClick={() => { if (free) { onChange(date, t); setShowOther(false) } }} disabled={!free}
                className={`${slotCls} ${sel ? 'bg-brand-500 border-brand-500 text-white font-700'
                  : !free ? 'border-dashed border-gray-200 bg-gray-50 text-gray-300'
                  : closedT ? 'border-slate-300 bg-slate-100 text-slate-500'
                  : past ? 'border-gray-100 text-gray-400 hover:bg-brand-50'
                  : 'border-brand-100 text-gray-700 hover:bg-brand-50'}`}>
                {t}
                {!free && <span className="block text-[9px] leading-none">마감</span>}
                {closedT && <span className="block text-[9px] leading-none">휴무시간</span>}
              </button>
            )
          })}
          {/* 영업시간 외 등 버튼에 없는 시각 */}
          <button type="button" onClick={openOther}
            className={`${slotCls} ${time && !isSlot ? 'bg-brand-500 border-brand-500 text-white font-700' : showOther ? 'border-brand-300 bg-brand-50 text-brand-600' : 'border-dashed border-brand-200 text-brand-500 hover:bg-brand-50'}`}>
            {time && !isSlot ? time : '＋ 다른 시간'}
            {time && !isSlot && <span className="block text-[9px] leading-none">직접 입력</span>}
          </button>
        </div>
        {showOther && (
          <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/50 p-2.5">
            <p className="text-[11px] font-600 text-brand-600 mb-1.5">다른 시간 (영업시간 외도 가능)</p>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg border border-brand-200 overflow-hidden shrink-0">
                {(['am', 'pm'] as const).map(a => (
                  <button key={a} type="button" onClick={() => setOther({ ...other, ampm: a })}
                    className={`px-3 py-2 text-sm font-600 ${other.ampm === a ? 'bg-brand-500 text-white' : 'bg-white text-brand-600'}`}>
                    {a === 'am' ? '오전' : '오후'}
                  </button>
                ))}
              </div>
              <select value={other.hour} onChange={e => setOther({ ...other, hour: Number(e.target.value) })}
                className="flex-1 min-w-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-2 outline-none">
                {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => <option key={h} value={h}>{h}시</option>)}
              </select>
              <select value={other.minute} onChange={e => setOther({ ...other, minute: Number(e.target.value) })}
                className="flex-1 min-w-0 text-sm rounded-lg border border-brand-200 bg-white px-2 py-2 outline-none">
                {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>)}
              </select>
            </div>
          </div>
        )}
        {time && (
          <p className={`mt-2 text-xs rounded-lg px-3 py-2 ${conflict ? 'bg-red-50 text-red-500' : closedConflict ? 'bg-slate-100 text-slate-600' : 'bg-brand-50 text-brand-600'}`}>
            {conflict ? '⚠ 다른 예약과 겹쳐요. ' : closedConflict ? '⚠ 휴무시간과 겹쳐요(저장 시 확인). ' : '→ '}
            {time} ~ {timeOf(minutesOf(time) + durationMin)} (정리 {timeOf(minutesOf(time) + durationMin + BUFFER_MIN)}까지)
            {!isSlot && !conflict && (outsideHours(date, time) ? ' · 영업시간 외' : ' · 직접 입력')}
          </p>
        )}
      </div>
    </div>
  )
}
