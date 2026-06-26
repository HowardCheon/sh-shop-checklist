'use client'

import { useState, useEffect, useCallback } from 'react'

/* ── 타입 ── */
interface Reservation {
  id: number
  customer_name: string
  customer_phone: string | null
  customer_id: number | null
  product_id: number | null
  product_name: string | null
  duration_min: number | null
  start_at: string
  end_at: string
  price: number | null
  status: 'scheduled' | 'completed' | 'cancelled'
  memo: string | null
  history?: HistoryItem[]
}

interface HistoryItem {
  id: number
  action: string
  description: string
  changed_at: string
}

interface Product {
  id: number
  name: string
  price: number
  duration_min: number | null
}

/* ── 유틸 ── */
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const fmtPrice = (n: number) => n.toLocaleString() + '원'

const STATUS_LABEL = { scheduled: '예약', completed: '완료', cancelled: '취소' } as const
const STATUS_COLOR = { scheduled: '#ec4899', completed: '#22c55e', cancelled: '#9ca3af' } as const
const STATUS_BG    = { scheduled: '#fdf2f8', completed: '#f0fdf4', cancelled: '#f9fafb' } as const

/* ── 예약 추가/수정 폼 ── */
const EMPTY_FORM = {
  customer_name: '', customer_phone: '', product_id: '', date: '', time: '', price: '', memo: '',
}

function ReservationForm({
  initial, products, date,
  onSave, onCancel, editId,
}: {
  initial?: typeof EMPTY_FORM
  products: Product[]
  date: string
  onSave: (form: typeof EMPTY_FORM) => Promise<string | null>
  onCancel: () => void
  editId?: number
}) {
  const [form, setForm] = useState(initial ?? { ...EMPTY_FORM, date })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const val = e.target.value
      setForm(f => {
        const next = { ...f, [k]: val }
        // 상품 선택 시 가격 자동 입력
        if (k === 'product_id') {
          const p = products.find(p => p.id === Number(val))
          if (p) next.price = p.price.toString()
        }
        return next
      })
    }

  const selectedProduct = products.find(p => p.id === Number(form.product_id))

  const handleSave = async () => {
    if (!form.customer_name.trim()) { setErr('고객명을 입력하세요'); return }
    if (!form.date || !form.time)   { setErr('예약 날짜/시간을 선택하세요'); return }
    setSaving(true); setErr('')
    const e = await onSave(form)
    if (e) { setErr(e); setSaving(false) }
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-pink-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-2" />
        <h2 className="text-base font-700 text-gray-900">{editId ? '예약 수정' : '예약 추가'}</h2>

        {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={lbl}>고객명 <span className="text-red-400">*</span></label>
            <input className={inp} placeholder="홍길동" value={form.customer_name} onChange={set('customer_name')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>연락처</label>
            <input className={inp} placeholder="010-0000-0000" value={form.customer_phone} onChange={set('customer_phone')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>시술 선택</label>
            <select className={inp} value={form.product_id} onChange={set('product_id')}>
              <option value="">선택 안 함</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.duration_min ? `(${p.duration_min}분)` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>날짜 <span className="text-red-400">*</span></label>
            <input type="date" className={inp} value={form.date} onChange={set('date')} />
          </div>
          <div>
            <label className={lbl}>시간 <span className="text-red-400">*</span></label>
            <input type="time" className={inp} value={form.time} onChange={set('time')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>금액 (원)</label>
            <input type="number" className={inp} placeholder="70000" value={form.price} onChange={set('price')} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>메모</label>
            <textarea className={inp} rows={2} placeholder="특이사항 등..." value={form.memo} onChange={set('memo')} />
          </div>
        </div>

        {selectedProduct && selectedProduct.duration_min && (
          <p className="text-xs text-pink-400 bg-pink-50 rounded-lg px-3 py-2">
            ⏱ 소요시간 {selectedProduct.duration_min}분 + 앞뒤 10분 버퍼 포함 예약 블록이 잡힙니다
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-gray-100">취소</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── 예약 상세 ── */
function ReservationDetail({
  res, onClose, onStatusChange, onEdit,
}: {
  res: Reservation & { history?: HistoryItem[] }
  onClose: () => void
  onStatusChange: (id: number, status: string) => Promise<void>
  onEdit: (r: Reservation) => void
}) {
  const [changing, setChanging] = useState<string | null>(null)
  const isToday = res.start_at.slice(0, 10) === fmt(new Date())

  const change = async (status: string) => {
    setChanging(status)
    await onStatusChange(res.id, status)
    setChanging(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-700 text-gray-900">{res.customer_name}</h2>
            {res.customer_phone && <p className="text-xs text-gray-400">{res.customer_phone}</p>}
          </div>
          <span
            className="text-xs font-700 px-3 py-1 rounded-full"
            style={{ background: STATUS_BG[res.status], color: STATUS_COLOR[res.status] }}
          >
            {STATUS_LABEL[res.status]}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          <Row label="날짜/시간" value={`${res.start_at.slice(0,10)} ${fmtTime(res.start_at)} ~ ${fmtTime(res.end_at)}`} />
          {res.product_name && <Row label="시술" value={`${res.product_name}${res.duration_min ? ` (${res.duration_min}분)` : ''}`} />}
          {res.price != null && <Row label="금액" value={fmtPrice(res.price)} />}
          {res.memo && <Row label="메모" value={res.memo} />}
        </div>

        {/* 상태 버튼 */}
        {res.status === 'scheduled' && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => change('completed')}
              disabled={!!changing}
              className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white"
              style={{ background: '#22c55e' }}
            >
              {changing === 'completed' ? '처리 중...' : '✓ 시술 완료'}
            </button>
            <button
              onClick={() => change('cancelled')}
              disabled={!!changing}
              className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white bg-gray-400"
            >
              {changing === 'cancelled' ? '처리 중...' : '✕ 예약 취소'}
            </button>
          </div>
        )}
        {res.status !== 'scheduled' && (
          <button
            onClick={() => change('scheduled')}
            disabled={!!changing}
            className="w-full py-2.5 rounded-xl text-sm font-700 text-pink-500 border border-pink-200 mb-4"
          >
            예약 복원
          </button>
        )}

        {res.status === 'scheduled' && (
          <button
            onClick={() => { onClose(); onEdit(res) }}
            className="w-full py-2 rounded-xl text-xs font-600 text-gray-500 bg-gray-50 mb-4"
          >
            ✏️ 예약 수정
          </button>
        )}

        {/* 당일 변경 이력 */}
        {isToday && res.history && res.history.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-700 text-gray-400 mb-2">변경 이력</p>
            <div className="space-y-1.5">
              {res.history.map(h => (
                <div key={h.id} className="flex gap-2 text-xs text-gray-500">
                  <span className="text-gray-300 shrink-0">{new Date(h.changed_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{h.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      <span className="text-xs text-gray-700">{value}</span>
    </div>
  )
}

/* ── 월 달력 ── */
function MonthCalendar({
  year, month, reservations, onDayClick,
}: {
  year: number; month: number
  reservations: Reservation[]
  onDayClick: (date: string) => void
}) {
  const today = fmt(new Date())
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay() // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: Array<{ date: string; day: number } | null> = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    cells.push({ date, day: d })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  // 날짜별 예약 그룹
  const byDate: Record<string, Reservation[]> = {}
  reservations.forEach(r => {
    const d = r.start_at.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(r)
  })

  const DOW = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-600 py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-2xl overflow-hidden">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} className="bg-white min-h-[60px]" />
          const isToday = cell.date === today
          const rsvs = byDate[cell.date] ?? []
          const col = i % 7
          return (
            <button
              key={cell.date}
              onClick={() => onDayClick(cell.date)}
              className="bg-white min-h-[60px] p-1 text-left hover:bg-pink-50 transition-colors"
            >
              <span className={`text-xs font-600 inline-flex w-5 h-5 items-center justify-center rounded-full
                ${isToday ? 'bg-pink-500 text-white' : col===0 ? 'text-red-400' : col===6 ? 'text-blue-400' : 'text-gray-700'}`}>
                {cell.day}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {rsvs.slice(0, 2).map(r => (
                  <div
                    key={r.id}
                    className="text-[9px] leading-tight px-1 rounded truncate"
                    style={{
                      background: STATUS_BG[r.status],
                      color: STATUS_COLOR[r.status],
                    }}
                  >
                    {fmtTime(r.start_at)} {r.customer_name}
                  </div>
                ))}
                {rsvs.length > 2 && (
                  <div className="text-[9px] text-gray-400 px-1">+{rsvs.length - 2}건</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── 메인 페이지 ── */
export default function ReservationsPage() {
  const [view, setView] = useState<'day' | 'month'>('day')
  const [currentDate, setCurrentDate] = useState(fmt(new Date()))
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [monthReservations, setMonthReservations] = useState<Reservation[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Reservation | null>(null)
  const [detailTarget, setDetailTarget] = useState<(Reservation & { history?: HistoryItem[] }) | null>(null)

  /* ── 상품 로드 ── */
  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => {
      setProducts(Array.isArray(d) ? d.filter((p: Product & { category: string }) => p.category === 'service') : [])
    })
  }, [])

  /* ── 일단위 예약 로드 ── */
  const loadDay = useCallback(async (date: string) => {
    setLoading(true)
    const from = `${date}T00:00:00`
    const to   = `${date}T23:59:59`
    const data = await fetch(`/api/reservations?from=${from}&to=${to}`).then(r => r.json())
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  /* ── 월단위 예약 로드 ── */
  const loadMonth = useCallback(async (year: number, month: number) => {
    const from = `${year}-${String(month+1).padStart(2,'0')}-01T00:00:00`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to   = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}T23:59:59`
    const data = await fetch(`/api/reservations?from=${from}&to=${to}`).then(r => r.json())
    setMonthReservations(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { loadDay(currentDate) }, [currentDate, loadDay])
  useEffect(() => { if (view === 'month') loadMonth(currentYear, currentMonth) }, [view, currentYear, currentMonth, loadMonth])

  /* ── 날짜 이동 ── */
  const moveDay = (d: number) => {
    const dt = new Date(currentDate)
    dt.setDate(dt.getDate() + d)
    setCurrentDate(fmt(dt))
  }
  const moveMonth = (d: number) => {
    let m = currentMonth + d, y = currentYear
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setCurrentMonth(m); setCurrentYear(y)
  }

  /* ── 예약 저장 ── */
  const handleSave = async (form: typeof EMPTY_FORM) => {
    const start_at = `${form.date}T${form.time}:00`
    const selectedProduct = products.find(p => p.id === Number(form.product_id))
    const payload = {
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      product_id: form.product_id ? Number(form.product_id) : null,
      product_name: selectedProduct?.name ?? null,
      duration_min: selectedProduct?.duration_min ?? 60,
      start_at,
      price: form.price ? Number(form.price) : null,
      memo: form.memo || null,
    }

    const method = editTarget ? 'PUT' : 'POST'
    const url = editTarget ? `/api/reservations/${editTarget.id}` : '/api/reservations'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()

    if (!res.ok) {
      if (data.conflict) {
        const c = data.conflict
        return `${c.customer_name}님 예약(${fmtTime(c.start_at)}~${fmtTime(c.end_at)})과 시간이 겹칩니다`
      }
      return data.error ?? '저장 실패'
    }

    setShowForm(false); setEditTarget(null)
    loadDay(currentDate)
    if (view === 'month') loadMonth(currentYear, currentMonth)
    return null
  }

  /* ── 상태 변경 ── */
  const handleStatusChange = async (id: number, status: string) => {
    await fetch(`/api/reservations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadDay(currentDate)
    if (view === 'month') loadMonth(currentYear, currentMonth)
  }

  /* ── 상세 열기 ── */
  const openDetail = async (r: Reservation) => {
    const data = await fetch(`/api/reservations/${r.id}`).then(d => d.json())
    setDetailTarget(data)
  }

  /* ── 편집 폼 열기 ── */
  const openEdit = (r: Reservation) => {
    const d = new Date(r.start_at)
    setEditTarget(r)
    setShowForm(true)
  }

  /* ── 날짜 표시 ── */
  const today = fmt(new Date())
  const dateLabel = currentDate === today ? '오늘' :
    currentDate === fmt(new Date(new Date().setDate(new Date().getDate() - 1))) ? '어제' :
    currentDate === fmt(new Date(new Date().setDate(new Date().getDate() + 1))) ? '내일' :
    currentDate

  /* ── 달 달력에서 날 클릭 ── */
  const handleDayClick = (date: string) => {
    setCurrentDate(date)
    setView('day')
  }

  const editInitial = editTarget ? {
    customer_name: editTarget.customer_name,
    customer_phone: editTarget.customer_phone ?? '',
    product_id: editTarget.product_id?.toString() ?? '',
    date: editTarget.start_at.slice(0, 10),
    time: editTarget.start_at.slice(11, 16),
    price: editTarget.price?.toString() ?? '',
    memo: editTarget.memo ?? '',
  } : undefined

  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-900 text-gray-900">예약 관리</h1>
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            <button
              onClick={() => setView('day')}
              className="px-3 py-1 rounded-lg text-xs font-600 transition-colors"
              style={view === 'day' ? { background: '#ec4899', color: '#fff' } : { color: '#9ca3af' }}
            >일</button>
            <button
              onClick={() => setView('month')}
              className="px-3 py-1 rounded-lg text-xs font-600 transition-colors"
              style={view === 'month' ? { background: '#ec4899', color: '#fff' } : { color: '#9ca3af' }}
            >월</button>
          </div>
        </div>

        {/* 날짜 네비게이션 */}
        {view === 'day' ? (
          <div className="flex items-center gap-3">
            <button onClick={() => moveDay(-1)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">←</button>
            <div className="flex-1 text-center">
              <span className="text-sm font-700 text-gray-800">{currentDate}</span>
              <span className="text-xs text-gray-400 ml-1">({dateLabel})</span>
            </div>
            <button onClick={() => moveDay(1)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">→</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => moveMonth(-1)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">←</button>
            <div className="flex-1 text-center">
              <span className="text-sm font-700 text-gray-800">{currentYear}년 {MONTH_NAMES[currentMonth]}</span>
            </div>
            <button onClick={() => moveMonth(1)} className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500">→</button>
          </div>
        )}
      </div>

      {/* 콘텐츠 */}
      <div className="px-4 py-4">
        {view === 'day' ? (
          loading ? (
            <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>
          ) : reservations.length === 0 ? (
            <div className="text-center py-14">
              <p className="text-4xl mb-3">📅</p>
              <p className="text-sm font-600 text-gray-500">예약이 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">+ 버튼으로 추가해 보세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reservations.map(r => (
                <button
                  key={r.id}
                  onClick={() => openDetail(r)}
                  className="w-full text-left bg-white rounded-2xl border p-4 shadow-sm"
                  style={{ borderColor: STATUS_COLOR[r.status] + '40' }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-700 text-gray-800">{r.customer_name}</span>
                        <span
                          className="text-[10px] font-700 px-2 py-0.5 rounded-full"
                          style={{ background: STATUS_BG[r.status], color: STATUS_COLOR[r.status] }}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      {r.product_name && (
                        <p className="text-xs text-gray-500 mt-0.5">{r.product_name}</p>
                      )}
                      {r.memo && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.memo}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-700" style={{ color: STATUS_COLOR[r.status] }}>
                        {fmtTime(r.start_at)}
                      </p>
                      <p className="text-xs text-gray-400">~ {fmtTime(r.end_at)}</p>
                      {r.price != null && <p className="text-xs text-gray-500 mt-0.5">{fmtPrice(r.price)}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <MonthCalendar
            year={currentYear}
            month={currentMonth}
            reservations={monthReservations}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      {/* 플로팅 추가 버튼 */}
      {!showForm && !detailTarget && (
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="fixed right-5 bottom-14 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-transform active:scale-90 z-30"
          style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}
        >+</button>
      )}

      {/* 예약 폼 */}
      {showForm && (
        <ReservationForm
          initial={editInitial}
          products={products}
          date={currentDate}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null) }}
          editId={editTarget?.id}
        />
      )}

      {/* 예약 상세 */}
      {detailTarget && (
        <ReservationDetail
          res={detailTarget}
          onClose={() => setDetailTarget(null)}
          onStatusChange={handleStatusChange}
          onEdit={(r) => { setDetailTarget(null); openEdit(r) }}
        />
      )}
    </div>
  )
}
