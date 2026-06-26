'use client'

import { useState, useEffect, useCallback } from 'react'

interface Product {
  id: number
  name: string
  price: number
  duration_min: number | null
  description: string | null
  is_active: boolean
}

const CAT = { color: '#ec4899', light: '#fdf2f8', border: '#fce7f3' }

const EMPTY_FORM = { name: '', price: '', duration_min: '', description: '' }

function formatPrice(n: number) {
  return n.toLocaleString() + '원'
}

function hourlyRate(price: number, durationMin: number | null) {
  if (!durationMin) return null
  return Math.round(price / durationMin * 60)
}

/* ── 상품 카드 ── */
function ProductCard({
  product,
  onToggle,
  onEdit,
  onDelete,
}: {
  product: Product
  onToggle: (id: number, active: boolean) => void
  onEdit: (p: Product) => void
  onDelete: (id: number) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div
      className={`bg-white rounded-2xl border p-4 shadow-sm transition-opacity ${!product.is_active ? 'opacity-50' : ''}`}
      style={{ borderColor: CAT.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-700 text-gray-800 text-sm">{product.name}</span>
            {!product.is_active && (
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">비활성</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-base font-800" style={{ color: CAT.color }}>{formatPrice(product.price)}</span>
            {product.duration_min && (
              <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">⏱ {product.duration_min}분</span>
            )}
            {hourlyRate(product.price, product.duration_min) && (
              <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">시간당 {hourlyRate(product.price, product.duration_min)!.toLocaleString()}원</span>
            )}
          </div>
          {product.description && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{product.description}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={() => onToggle(product.id, !product.is_active)}
            className="w-11 h-6 rounded-full transition-colors relative"
            style={{ backgroundColor: product.is_active ? CAT.color : '#d1d5db' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ left: product.is_active ? '22px' : '2px' }}
            />
          </button>
          <div className="flex gap-1">
            <button
              onClick={() => onEdit(product)}
              className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-sm hover:bg-pink-50 transition-colors"
            >✏️</button>
            {confirmDel ? (
              <button
                onClick={() => onDelete(product.id)}
                className="h-7 px-2 rounded-lg bg-red-500 text-white text-xs font-bold"
              >삭제</button>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                onBlur={() => setTimeout(() => setConfirmDel(false), 200)}
                className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-sm hover:bg-red-50 transition-colors"
              >🗑️</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── 추가/수정 폼 ── */
function ProductForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: typeof EMPTY_FORM
  onSave: (form: typeof EMPTY_FORM) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim() || form.price === '') return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const inp = "w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 outline-none bg-gray-50 focus:bg-white focus:border-pink-300 transition-colors"
  const lbl = "block text-xs font-600 text-gray-500 mb-1"

  return (
    <div className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: '#fce7f3', backgroundColor: CAT.light }}>
      <div>
        <label className={lbl}>메뉴명 <span className="text-red-400">*</span></label>
        <input className={inp} placeholder="예: 모공 클렌징 케어" value={form.name} onChange={set('name')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>가격 (원) <span className="text-red-400">*</span></label>
          <input type="number" className={inp} placeholder="70000" value={form.price} onChange={set('price')} />
        </div>
        <div>
          <label className={lbl}>소요 시간 (분)</label>
          <input type="number" className={inp} placeholder="60" value={form.duration_min} onChange={set('duration_min')} />
        </div>
      </div>
      <div>
        <label className={lbl}>설명 (선택)</label>
        <textarea className={inp} rows={2} placeholder="간단한 시술 설명..." value={form.description} onChange={set('description')} />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-600 text-gray-500 bg-white border border-gray-200">취소</button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim() || form.price === ''}
          className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

/* ── 메인 페이지 ── */
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/products').then(r => r.json())
      setProducts(Array.isArray(data) ? data.filter((p: Product & { category: string }) => p.category === 'service') : [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toNum = (v: string) => v === '' ? null : Number(v)

  const handleAdd = async (form: typeof EMPTY_FORM) => {
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'service',
        name: form.name,
        price: Number(form.price),
        duration_min: toNum(form.duration_min),
        stock: null,
        description: form.description || null,
      }),
    })
    setShowForm(false)
    load()
  }

  const handleEdit = async (form: typeof EMPTY_FORM) => {
    if (!editTarget) return
    await fetch(`/api/products/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        price: Number(form.price),
        duration_min: toNum(form.duration_min),
        description: form.description || null,
      }),
    })
    setEditTarget(null)
    load()
  }

  const handleToggle = async (id: number, active: boolean) => {
    await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    load()
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/products/${id}`, { method: 'DELETE' })
    load()
  }

  const toForm = (p: Product): typeof EMPTY_FORM => ({
    name: p.name,
    price: p.price.toString(),
    duration_min: p.duration_min?.toString() ?? '',
    description: p.description ?? '',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 shadow-sm px-4 pt-5 pb-4">
        <h1 className="text-xl font-900 text-gray-900">시술 메뉴</h1>
        <p className="text-xs text-gray-400 mt-0.5">메뉴별 가격과 소요 시간을 관리하세요</p>
      </div>

      {/* 목록 */}
      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>
        ) : (
          <>
            {products.map(p =>
              editTarget?.id === p.id ? (
                <ProductForm
                  key={p.id}
                  initial={toForm(p)}
                  onSave={handleEdit}
                  onCancel={() => setEditTarget(null)}
                />
              ) : (
                <ProductCard
                  key={p.id}
                  product={p}
                  onToggle={handleToggle}
                  onEdit={prod => { setShowForm(false); setEditTarget(prod) }}
                  onDelete={handleDelete}
                />
              )
            )}

            {products.length === 0 && !showForm && (
              <div className="text-center py-14">
                <p className="text-4xl mb-3">✨</p>
                <p className="text-sm font-600 text-gray-500">등록된 시술 메뉴가 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">+ 버튼으로 추가해 보세요</p>
              </div>
            )}

            {showForm && (
              <ProductForm
                initial={EMPTY_FORM}
                onSave={handleAdd}
                onCancel={() => setShowForm(false)}
              />
            )}
          </>
        )}
      </div>

      {/* 플로팅 추가 버튼 */}
      {!showForm && !editTarget && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed right-5 bottom-14 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-transform active:scale-90 z-30"
          style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)' }}
        >
          +
        </button>
      )}
    </div>
  )
}
