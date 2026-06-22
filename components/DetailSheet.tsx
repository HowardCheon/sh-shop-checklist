'use client'

import { useEffect, useRef } from 'react'
import type { ChecklistItem, ChecklistSection } from '@/lib/checklist-data'

interface DetailSheetProps {
  item: ChecklistItem | null
  section: ChecklistSection | null
  onClose: () => void
}

export default function DetailSheet({ item, section, onClose }: DetailSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const isOpen = !!item

  // 백드롭 터치 시 닫기
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  // 키보드 ESC 닫기
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // body 스크롤 잠금
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: isOpen ? 0.4 : 0 }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out max-h-[85vh] flex flex-col"
        style={{
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        {section && item && (
          <div
            className="flex items-center gap-3 px-5 py-3 shrink-0"
            style={{ borderBottom: `2px solid ${section.borderColor}` }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: section.bgLight }}
            >
              {section.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-500 mb-0.5"
                style={{ color: section.textColor }}
              >
                {section.title}
              </p>
              <p className="text-base font-700 text-gray-900 leading-snug">
                {item.text}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 active:bg-gray-200 transition-colors"
              aria-label="닫기"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1L11 11M11 1L1 11"
                  stroke="#6b7280"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Description */}
          {item?.description && (
            <div>
              <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-2">
                상세 설명
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {item.description}
              </p>
            </div>
          )}

          {/* Tips */}
          {item?.tips && item.tips.length > 0 && (
            <div>
              <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-2">
                실전 팁
              </h3>
              <ul className="space-y-2.5">
                {item.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 shrink-0"
                      style={{
                        backgroundColor: section?.bgLight,
                        color: section?.textColor,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 leading-relaxed flex-1">
                      {tip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bottom padding for safe area */}
          <div className="h-4" />
        </div>

        {/* Close Button */}
        <div className="px-5 pb-6 pt-2 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-sm font-700 text-white transition-opacity active:opacity-80"
            style={{
              background: section
                ? `linear-gradient(135deg, ${section.checkColor}, ${section.progressColor})`
                : 'linear-gradient(135deg, #f43f5e, #a855f7)',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
