'use client'

import { useState, useCallback } from 'react'

/* 같은 사이트 내부 경로만 허용 (//evil.com, /\\evil.com 등 차단) */
function safeNext(next: string) {
  try {
    const url = new URL(next, window.location.origin)
    return url.origin === window.location.origin ? url.pathname + url.search : '/'
  } catch {
    return '/'
  }
}

/* PIN 키패드 로그인 — 서버에서 PIN 검증 후 세션 쿠키 발급 */
export default function PinLogin({ next }: { next: string }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async (value: string) => {
    setBusy(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: value }),
    }).catch(() => null)
    if (res?.ok) {
      // 서버 컴포넌트가 새 쿠키로 다시 렌더되도록 전체 이동
      window.location.replace(safeNext(next))
      return
    }
    const data = await res?.json().catch(() => null)
    setBusy(false)
    setError(data?.error ?? '로그인에 실패했습니다')
    setShake(true)
    setTimeout(() => { setShake(false); setPin('') }, 700)
  }, [next])

  const handleKey = useCallback((digit: string) => {
    if (busy) return
    if (error) {
      setError(null)
      setPin('')
      return
    }
    setPin(prev => {
      if (prev.length >= 4) return prev
      const value = prev + digit
      if (value.length === 4) submit(value)
      return value
    })
  }, [error, busy, submit])

  const handleDelete = useCallback(() => {
    if (error) { setError(null); setPin(''); return }
    setPin(prev => prev.slice(0, -1))
  }, [error])

  const dots = Array.from({ length: 4 }, (_, i) => ({
    filled: i < pin.length,
    error: !!error,
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
              🚫 {error}
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
