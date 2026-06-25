'use client'

import { useState, useEffect, useCallback } from 'react'

const CORRECT_PIN = '9994'
const STORAGE_KEY = 'sh_shop_auth'
const EXPIRES_MS = 30 * 24 * 60 * 60 * 1000 // 1개월

function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const { expiresAt } = JSON.parse(raw)
    return Date.now() < expiresAt
  } catch {
    return false
  }
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ expiresAt: Date.now() + EXPIRES_MS }))
}

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    setAuthed(isAuthenticated())
  }, [])

  const handleKey = useCallback((digit: string) => {
    if (error) {
      setError(false)
      setPin('')
      return
    }
    setPin(prev => {
      const next = prev + digit
      if (next.length === 4) {
        if (next === CORRECT_PIN) {
          saveAuth()
          setTimeout(() => setAuthed(true), 300)
          return next
        } else {
          setError(true)
          setShake(true)
          setTimeout(() => { setShake(false); setPin('') }, 700)
          return next
        }
      }
      return next
    })
  }, [error])

  const handleDelete = useCallback(() => {
    if (error) { setError(false); setPin(''); return }
    setPin(prev => prev.slice(0, -1))
  }, [error])

  if (authed === null) return null
  if (authed) return <>{children}</>

  const dots = Array.from({ length: 4 }, (_, i) => ({
    filled: i < pin.length,
    error,
  }))

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-white to-purple-50" style={{ minHeight: '100dvh' }}>
      {/* 로고 영역 */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-md"
          style={{ background: 'linear-gradient(135deg, #f472b6, #a855f7)' }}>
          <span className="text-3xl">🌸</span>
        </div>
        <h1 className="text-xl font-bold text-gray-800">피부관리샵 체크리스트</h1>
        <p className="text-sm text-gray-400 mt-1">PIN 번호를 입력하세요</p>
      </div>

      {/* 도트 표시 */}
      <div className={`flex gap-4 mb-3 ${shake ? 'animate-shake' : ''}`}>
        {dots.map((d, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              d.error
                ? 'bg-red-400 border-red-400'
                : d.filled
                ? 'border-pink-500'
                : 'border-gray-300'
            }`}
            style={d.filled && !d.error ? { background: 'linear-gradient(135deg, #f472b6, #a855f7)' } : {}}
          />
        ))}
      </div>

      {/* 오류 메시지 */}
      <div className="h-6 mb-6 flex items-center">
        {error && (
          <p className="text-sm font-semibold text-red-500 animate-pulse">
            🚫 접근 권한이 없습니다
          </p>
        )}
      </div>

      {/* 키패드 */}
      <div className="grid grid-cols-3 gap-3 w-72">
        {['1','2','3','4','5','6','7','8','9'].map(d => (
          <button
            key={d}
            onClick={() => handleKey(d)}
            className="h-16 rounded-2xl text-xl font-semibold text-gray-700 bg-white shadow-sm border border-gray-100 active:scale-95 active:bg-pink-50 transition-all duration-100"
          >
            {d}
          </button>
        ))}
        {/* 빈 칸 */}
        <div />
        <button
          onClick={() => handleKey('0')}
          className="h-16 rounded-2xl text-xl font-semibold text-gray-700 bg-white shadow-sm border border-gray-100 active:scale-95 active:bg-pink-50 transition-all duration-100"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          className="h-16 rounded-2xl text-xl text-gray-500 bg-white shadow-sm border border-gray-100 active:scale-95 active:bg-gray-50 transition-all duration-100 flex items-center justify-center"
        >
          ⌫
        </button>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  )
}
