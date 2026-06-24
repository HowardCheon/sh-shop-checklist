'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { ChecklistItem, ChecklistSection } from '@/lib/checklist-data'

interface HistoryEntry {
  id: number
  action: 'checked' | 'unchecked' | 'note_updated'
  note: string | null
  created_at: string
}

interface DetailSheetProps {
  item: ChecklistItem | null
  section: ChecklistSection | null
  isChecked: boolean
  currentNote: string
  onClose: () => void
  onNoteSave: (itemId: string, note: string) => Promise<void>
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ACTION_META = {
  checked:      { icon: '✅', label: '체크 완료' },
  unchecked:    { icon: '⬜', label: '체크 해제' },
  note_updated: { icon: '📝', label: '처리 내용 기록' },
} as const

export default function DetailSheet({ item, section, isChecked, currentNote, onClose, onNoteSave }: DetailSheetProps) {
  const isOpen = !!item

  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // 시트 열릴 때 note/history 초기화
  useEffect(() => {
    if (!item) return
    setNoteText(currentNote)
    setNoteSaved(false)
    setHistory([])
    setHistoryLoading(true)

    fetch(`/api/checklist/history?itemId=${encodeURIComponent(item.id)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: HistoryEntry[]) => setHistory(data))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveNote = useCallback(async () => {
    if (!item) return
    setNoteSaving(true)
    try {
      await onNoteSave(item.id, noteText)
      setNoteSaved(true)
      // 이력 새로고침
      const data = await fetch(`/api/checklist/history?itemId=${encodeURIComponent(item.id)}`).then(r => r.json())
      setHistory(data)
      setTimeout(() => setNoteSaved(false), 2000)
    } finally {
      setNoteSaving(false)
    }
  }, [item, noteText, onNoteSave])

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const noteChanged = noteText !== currentNote

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: isOpen ? 0.4 : 0 }}
      />

      {/* Sheet */}
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out max-h-[90vh] flex flex-col"
        style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        {section && item && (
          <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderBottom: `2px solid ${section.borderColor}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: section.bgLight }}>
              {section.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-500 mb-0.5" style={{ color: section.textColor }}>{section.title}</p>
              <p className="text-base font-700 text-gray-900 leading-snug">{item.text}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 active:bg-gray-200 transition-colors"
              aria-label="닫기"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Description */}
          {item?.description && (
            <div>
              <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-2">상세 설명</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Tips */}
          {item?.tips && item.tips.length > 0 && (
            <div>
              <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-2">실전 팁</h3>
              <ul className="space-y-2.5">
                {item.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-700 shrink-0" style={{ backgroundColor: section?.bgLight, color: section?.textColor }}>
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 leading-relaxed flex-1">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 처리 내용 메모 */}
          <div>
            <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-2">처리 내용</h3>
            <div className="relative">
              <textarea
                value={noteText}
                onChange={e => { setNoteText(e.target.value); setNoteSaved(false) }}
                placeholder={isChecked ? '어떻게 처리했는지 기록해 두세요...' : '체크 후 처리 내용을 기록할 수 있습니다.'}
                rows={3}
                className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2.5 resize-none outline-none transition-colors leading-relaxed"
                style={{
                  borderColor: noteChanged ? section?.borderColor : undefined,
                  backgroundColor: '#fafafa',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = section?.borderColor ?? '#e5e7eb' }}
                onBlur={e => { if (!noteChanged) e.currentTarget.style.borderColor = '#e5e7eb' }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
              {noteSaved && (
                <span className="text-xs text-green-500 font-500">저장됐습니다 ✓</span>
              )}
              <button
                onClick={handleSaveNote}
                disabled={noteSaving || !noteChanged}
                className="px-4 py-1.5 rounded-lg text-xs font-700 text-white transition-all active:opacity-80 disabled:opacity-40"
                style={{
                  background: section ? `linear-gradient(135deg, ${section.checkColor}, ${section.progressColor})` : 'linear-gradient(135deg, #f43f5e, #a855f7)',
                }}
              >
                {noteSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>

          {/* 수정 이력 */}
          <div>
            <h3 className="text-xs font-700 text-gray-400 uppercase tracking-wider mb-3">수정 이력</h3>
            {historyLoading ? (
              <p className="text-xs text-gray-400 text-center py-3">불러오는 중...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">아직 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((entry, i) => {
                  const meta = ACTION_META[entry.action]
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center shrink-0">
                        <span className="text-base leading-none">{meta.icon}</span>
                        {i < history.length - 1 && (
                          <div className="w-px flex-1 mt-1.5 bg-gray-100 min-h-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-600 text-gray-700">{meta.label}</span>
                          <span className="text-xs text-gray-400">{formatDate(entry.created_at)}</span>
                        </div>
                        {entry.action === 'note_updated' && entry.note && (
                          <p className="mt-1 text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-2.5 py-2">{entry.note}</p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="h-4" />
        </div>

        {/* 닫기 버튼 */}
        <div className="px-5 pb-6 pt-2 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-sm font-700 text-white transition-opacity active:opacity-80"
            style={{ background: section ? `linear-gradient(135deg, ${section.checkColor}, ${section.progressColor})` : 'linear-gradient(135deg, #f43f5e, #a855f7)' }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
