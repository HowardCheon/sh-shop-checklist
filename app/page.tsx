'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { sections, totalItems, type ChecklistItem, type ChecklistSection } from '@/lib/checklist-data'
import DetailSheet from '@/components/DetailSheet'

const STORAGE_KEY = 'sh-shop-checklist-v1'

function ProgressRing({ value, size = 120 }: { value: number; size?: number }) {
  const radius = 45
  const stroke = 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
      <circle
        cx="50" cy="50" r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={stroke}
      />
      <circle
        cx="50" cy="50" r={radius}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="progress-ring-circle transition-all duration-700 ease-out"
      />
    </svg>
  )
}

interface DetailState {
  item: ChecklistItem
  section: ChecklistSection
}

function SectionCard({
  section,
  checked,
  onToggle,
  onDetail,
  index,
}: {
  section: ChecklistSection
  checked: Set<string>
  onToggle: (id: string) => void
  onDetail: (item: ChecklistItem, section: ChecklistSection) => void
  index: number
}) {
  const [expanded, setExpanded] = useState(true)
  const sectionChecked = section.items.filter(i => checked.has(i.id)).length
  const sectionTotal = section.items.length
  const sectionPct = Math.round((sectionChecked / sectionTotal) * 100)
  const allDone = sectionChecked === sectionTotal

  return (
    <div
      className="section-card bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* Section Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
        style={{ backgroundColor: section.bgLight }}
      >
        <span className="text-2xl">{section.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-700 text-sm" style={{ color: section.textColor }}>
              {section.title}
            </span>
            {allDone && (
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-white font-500"
                style={{ color: section.checkColor }}
              >
                완료 ✓
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/60 overflow-hidden w-full">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${sectionPct}%`, backgroundColor: section.progressColor }}
            />
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs font-700" style={{ color: section.textColor }}>
            {sectionChecked}/{sectionTotal}
          </span>
          <span
            className="text-lg leading-none mt-0.5 transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ⌄
          </span>
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <ul className="divide-y divide-gray-50">
          {section.items.map(item => {
            const isChecked = checked.has(item.id)
            return (
              <li key={item.id} className="flex items-stretch">
                {/* Checkbox + text area */}
                <label className="flex items-start gap-3 px-4 py-3.5 cursor-pointer active:bg-gray-50 transition-colors flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isChecked}
                      onChange={() => onToggle(item.id)}
                    />
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                      style={{
                        borderColor: isChecked ? section.checkColor : '#d1d5db',
                        backgroundColor: isChecked ? section.checkColor : 'transparent',
                      }}
                    >
                      {isChecked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-500 leading-snug transition-all duration-200"
                      style={{
                        color: isChecked ? '#9ca3af' : '#1f2937',
                        textDecoration: isChecked ? 'line-through' : 'none',
                      }}
                    >
                      {item.text}
                    </p>
                    {item.detail && (
                      <p
                        className="text-xs mt-0.5 transition-colors duration-200"
                        style={{ color: isChecked ? '#d1d5db' : '#6b7280' }}
                      >
                        {item.detail}
                      </p>
                    )}
                  </div>
                </label>

                {/* Detail arrow button */}
                <button
                  onClick={() => onDetail(item, section)}
                  className="flex items-center justify-center w-11 shrink-0 active:bg-gray-50 transition-colors border-l border-gray-50"
                  aria-label={`${item.text} 상세 보기`}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                    style={{ backgroundColor: section.bgLight }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      style={{ color: section.textColor }}
                    >
                      <path
                        d="M3 2L7 5L3 8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Confetti() {
  const colors = ['#f9a8d4', '#c084fc', '#93c5fd', '#86efac', '#fde68a', '#fca5a5']
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="confetti-piece absolute w-2 h-2 rounded-sm"
          style={{
            left: `${(i / 24) * 100}%`,
            top: '10%',
            backgroundColor: colors[i % colors.length],
            animationDelay: `${i * 0.05}s`,
            animationDuration: `${1 + (i % 3) * 0.3}s`,
          }}
        />
      ))}
    </div>
  )
}

export default function Home() {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const prevCount = useRef(0)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setChecked(new Set(JSON.parse(saved) as string[]))
      } catch {
        // ignore
      }
    }
    setLoaded(true)
  }, [])

  const toggle = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      if (next.size === totalItems && prevCount.current < totalItems) {
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 2000)
      }
      prevCount.current = next.size
      return next
    })
  }, [])

  const openDetail = useCallback((item: ChecklistItem, section: ChecklistSection) => {
    setDetail({ item, section })
  }, [])

  const closeDetail = useCallback(() => {
    setDetail(null)
  }, [])

  const progress = loaded ? Math.round((checked.size / totalItems) * 100) : 0

  const resetAll = () => {
    if (confirm('모든 체크를 초기화할까요?')) {
      setChecked(new Set())
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fdf2f8' }}>
      {showConfetti && <Confetti />}

      {/* Hero Header */}
      <div
        className="relative overflow-hidden pt-10 pb-8 px-5"
        style={{
          background: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 40%, #a855f7 100%)',
        }}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20 bg-white" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15 bg-white" />

        <div className="relative flex flex-col items-center text-center text-white">
          <p className="text-white/80 text-xs font-500 tracking-widest uppercase mb-1">
            1인 예약제
          </p>
          <h1 className="text-2xl font-900 leading-tight mb-1">피부관리샵 창업</h1>
          <h2 className="text-lg font-500 text-white/90 mb-6">준비 체크리스트 🌸</h2>

          <div className="relative">
            <ProgressRing value={progress} size={130} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-900">{progress}%</span>
              <span className="text-white/80 text-xs font-500">완료</span>
            </div>
          </div>

          <p className="mt-4 text-white/90 text-sm font-500">
            전체 {totalItems}개 중{' '}
            <span className="font-900">{loaded ? checked.size : 0}개</span> 완료
          </p>

          {progress === 100 && (
            <div className="mt-4 px-5 py-2 bg-white/20 backdrop-blur-sm rounded-full">
              <span className="text-sm font-700">🎉 모든 준비 완료! 오픈 화이팅!</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-5 space-y-3 max-w-lg mx-auto pb-24">
        {/* Tip */}
        <div className="flex items-start gap-2.5 bg-white rounded-xl px-4 py-3 text-xs text-gray-500 border border-gray-100">
          <span className="text-base shrink-0">💡</span>
          <p className="leading-relaxed">
            항목을 탭하면 완료 표시, <span className="font-600 text-gray-700">→ 버튼</span>을 누르면 상세 설명을 볼 수 있습니다.
          </p>
        </div>

        {/* Sections */}
        {sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            checked={checked}
            onToggle={toggle}
            onDetail={openDetail}
            index={index}
          />
        ))}

        {/* Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-xs text-amber-800">
          <p className="font-700 mb-1">⚠️ 전문가 확인 권장</p>
          <p className="leading-relaxed text-amber-700">
            법적 요건(자격증·영업신고·사업자등록)은 관할 구청 또는
            세무사·행정사에게 최종 확인을 권장합니다.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={resetAll}
            className="text-xs text-gray-400 underline underline-offset-2 active:text-gray-600"
          >
            체크 초기화
          </button>
        </div>
      </div>

      {/* Detail Bottom Sheet */}
      <DetailSheet
        item={detail?.item ?? null}
        section={detail?.section ?? null}
        onClose={closeDetail}
      />
    </div>
  )
}
