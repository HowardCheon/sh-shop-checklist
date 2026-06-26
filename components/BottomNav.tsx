'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  {
    href: '/',
    label: '체크리스트',
    icon: (active: boolean) => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#g1)' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: '상품관리',
    icon: (active: boolean) => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? 'url(#g2)' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <defs>
          <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-lg">
      <div className="flex">
        {TABS.map(tab => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center py-1 gap-0.5 transition-opacity active:opacity-60"
            >
              {tab.icon(active)}
              <span
                className="text-[10px] font-600 transition-colors"
                style={{ color: active ? '#a855f7' : '#9ca3af' }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* iOS safe area */}
      <div className="h-safe-area-inset-bottom" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}
