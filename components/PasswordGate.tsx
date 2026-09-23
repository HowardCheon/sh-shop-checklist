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
    <div className="fixed inset-0 overflow-y-auto bg-stone-bg z-50">
      <div className="flex flex-col items-center justify-center min-h-full py-10 px-4">

        {/* 로고 영역 */}
        <div className="flex flex-col items-center mb-10">
          <img src="/onflow-logo.png" alt="온:플로우 로고" className="w-24 h-24 object-contain mb-3" />
          <h1 className="font-serif text-2xl font-extrabold text-brand-600 tracking-wide">온:플로우</h1>
          <p className="font-serif text-[10px] text-brand-500 tracking-[0.35em] mt-1 mb-3">AESTHETICS</p>
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
                  ? 'border-brand-500'
                  : 'border-gray-300'
              }`}
              style={d.filled && !d.error ? { background: '#bc7659' } : {}}
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
              className="h-16 rounded-2xl text-xl font-semibold text-gray-700 bg-white shadow-sm border border-gray-100 hover:bg-brand-50 hover:border-brand-200 active:scale-95 active:bg-brand-100 transition-all duration-100 cursor-pointer select-none"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleKey('0')}
            className="h-16 rounded-2xl text-xl font-semibold text-gray-700 bg-white shadow-sm border border-gray-100 hover:bg-brand-50 hover:border-brand-200 active:scale-95 active:bg-brand-100 transition-all duration-100 cursor-pointer select-none"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-16 rounded-2xl text-xl text-gray-500 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 hover:border-gray-200 active:scale-95 active:bg-gray-100 transition-all duration-100 flex items-center justify-center cursor-pointer select-none"
          >
            ⌫
          </button>
        </div>

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
