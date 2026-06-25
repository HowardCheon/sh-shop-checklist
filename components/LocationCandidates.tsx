'use client'

import { useState, useEffect, useCallback } from 'react'

interface Location {
  id: number
  name: string
  deposit: number | null
  monthly_rent: number | null
  maintenance_fee: number | null
  pros: string | null
  cons: string | null
  memo: string | null
}

const EMPTY_FORM = {
  name: '',
  deposit: '',
  monthly_rent: '',
  maintenance_fee: '',
  pros: '',
  cons: '',
  memo: '',
}

function MoneyBadge({ label, value }: { label: string; value: number | null }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
      <span className="text-amber-400 font-bold">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}만</span>
    </span>
  )
}

function LocationCard({
  loc,
  onEdit,
  onDelete,
}: {
  loc: Location
  onEdit: (loc: Location) => void
  onDelete: (id: number) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="bg-white border border-amber-100 rounded-2xl p-4 shadow-sm">
      {/* 장소명 + 버튼 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🏢</span>
          <span className="text-sm font-700 text-gray-800 leading-snug">{loc.name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(loc)}
            className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-amber-50 hover:text-amber-500 transition-colors"
          >
            ✏️
          </button>
          {confirmDelete ? (
            <button
              onClick={() => onDelete(loc.id)}
              className="h-7 px-2 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center"
            >
              삭제
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              onBlur={() => setTimeout(() => setConfirmDelete(false), 200)}
              className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-400 transition-colors"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* 비용 뱃지 */}
      {(loc.deposit || loc.monthly_rent || loc.maintenance_fee) && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          <MoneyBadge label="보증금" value={loc.deposit} />
          <MoneyBadge label="월세" value={loc.monthly_rent} />
          <MoneyBadge label="관리비" value={loc.maintenance_fee} />
        </div>
      )}

      {/* 장단점 */}
      {loc.pros && (
        <div className="flex gap-2 mb-1.5">
          <span className="text-xs text-green-500 shrink-0 mt-0.5">👍</span>
          <p className="text-xs text-gray-600 leading-relaxed">{loc.pros}</p>
        </div>
      )}
      {loc.cons && (
        <div className="flex gap-2 mb-1.5">
          <span className="text-xs text-red-400 shrink-0 mt-0.5">👎</span>
          <p className="text-xs text-gray-600 leading-relaxed">{loc.cons}</p>
        </div>
      )}
      {loc.memo && (
        <div className="flex gap-2">
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">📌</span>
          <p className="text-xs text-gray-500 leading-relaxed">{loc.memo}</p>
        </div>
      )}
    </div>
  )
}

function LocationForm({
  initial,
  accentColor,
  onSave,
  onCancel,
}: {
  initial: typeof EMPTY_FORM
  accentColor: string
  onSave: (form: typeof EMPTY_FORM) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const inputCls = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-amber-300 transition-colors"
  const labelCls = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
      <div>
        <label className={labelCls}>장소명 <span className="text-red-400">*</span></label>
        <input className={inputCls} placeholder="예: 강남 OO빌딩 2층" value={form.name} onChange={set('name')} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>보증금 (만원)</label>
          <input type="number" className={inputCls} placeholder="0" value={form.deposit} onChange={set('deposit')} />
        </div>
        <div>
          <label className={labelCls}>월세 (만원)</label>
          <input type="number" className={inputCls} placeholder="0" value={form.monthly_rent} onChange={set('monthly_rent')} />
        </div>
        <div>
          <label className={labelCls}>관리비 (만원)</label>
          <input type="number" className={inputCls} placeholder="0" value={form.maintenance_fee} onChange={set('maintenance_fee')} />
        </div>
      </div>

      <div>
        <label className={labelCls}>👍 장점</label>
        <textarea className={inputCls} rows={2} placeholder="접근성 좋음, 주차 가능, 유동인구 많음..." value={form.pros} onChange={set('pros')} />
      </div>
      <div>
        <label className={labelCls}>👎 단점</label>
        <textarea className={inputCls} rows={2} placeholder="월세 부담, 좁은 면적, 주차 불편..." value={form.cons} onChange={set('cons')} />
      </div>
      <div>
        <label className={labelCls}>📌 기타 메모</label>
        <textarea className={inputCls} rows={2} placeholder="추가로 기억할 내용..." value={form.memo} onChange={set('memo')} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-white border border-gray-200 active:opacity-70 transition-opacity"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white transition-opacity active:opacity-80 disabled:opacity-40"
          style={{ background: `linear-gradient(135deg, ${accentColor}, #fbbf24)` }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

export default function LocationCandidates({ accentColor }: { accentColor: string }) {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Location | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/locations').then(r => r.json())
      setLocations(Array.isArray(data) ? data : [])
    } catch { setLocations([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toNum = (v: string) => v === '' ? null : Number(v)

  const handleAdd = async (form: typeof EMPTY_FORM) => {
    await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        deposit: toNum(form.deposit),
        monthly_rent: toNum(form.monthly_rent),
        maintenance_fee: toNum(form.maintenance_fee),
        pros: form.pros || null,
        cons: form.cons || null,
        memo: form.memo || null,
      }),
    })
    setShowForm(false)
    load()
  }

  const handleEdit = async (form: typeof EMPTY_FORM) => {
    if (!editTarget) return
    await fetch(`/api/locations/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        deposit: toNum(form.deposit),
        monthly_rent: toNum(form.monthly_rent),
        maintenance_fee: toNum(form.maintenance_fee),
        pros: form.pros || null,
        cons: form.cons || null,
        memo: form.memo || null,
      }),
    })
    setEditTarget(null)
    load()
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    load()
  }

  const toForm = (loc: Location): typeof EMPTY_FORM => ({
    name: loc.name,
    deposit: loc.deposit?.toString() ?? '',
    monthly_rent: loc.monthly_rent?.toString() ?? '',
    maintenance_fee: loc.maintenance_fee?.toString() ?? '',
    pros: loc.pros ?? '',
    cons: loc.cons ?? '',
    memo: loc.memo ?? '',
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider">
          🏢 장소 후보지 {locations.length > 0 && <span className="text-amber-500">({locations.length})</span>}
        </h3>
        {!showForm && !editTarget && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-600 text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 active:opacity-70 transition-opacity"
          >
            <span className="text-sm leading-none">+</span> 추가
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 text-center py-4">불러오는 중...</p>
      ) : (
        <div className="space-y-3">
          {locations.map(loc =>
            editTarget?.id === loc.id ? (
              <LocationForm
                key={loc.id}
                initial={toForm(loc)}
                accentColor={accentColor}
                onSave={handleEdit}
                onCancel={() => setEditTarget(null)}
              />
            ) : (
              <LocationCard
                key={loc.id}
                loc={loc}
                onEdit={l => { setShowForm(false); setEditTarget(l) }}
                onDelete={handleDelete}
              />
            )
          )}

          {locations.length === 0 && !showForm && (
            <div className="text-center py-6 text-gray-400">
              <p className="text-2xl mb-2">🏙️</p>
              <p className="text-xs">방문한 장소를 기록해 보세요</p>
            </div>
          )}

          {showForm && (
            <LocationForm
              initial={EMPTY_FORM}
              accentColor={accentColor}
              onSave={handleAdd}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
