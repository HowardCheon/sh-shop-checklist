import type { ReactNode } from 'react'

/* 온:플로우 브랜드 헤더 (매장 윈도우 시트 디자인) — 예약·시술메뉴·고객·로딩 화면 공용 */
export default function BrandHeader({ right, children }: { right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bg-white/60 backdrop-blur border-b border-brand-100 px-4 pt-6 pb-3">
      <div className="flex items-center gap-3">
        <img src="/onflow-logo.png" alt="온:플로우 로고" className="w-12 h-12 object-contain shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-serif text-2xl font-extrabold text-brand-600 leading-none tracking-wide">온:플로우</p>
          <p className="font-serif text-[10px] text-brand-500 tracking-[0.35em] mt-1">AESTHETICS</p>
        </div>
        {right}
      </div>

      <div className="brand-divider my-3"><span className="text-[8px]">◆</span></div>

      {children}
    </div>
  )
}

/* 브랜드 헤더 아래 가운데 정렬 페이지 제목 */
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="text-center">
      <h1 className="font-serif text-lg font-extrabold text-brand-700 tracking-wide">{title}</h1>
      {sub && <p className="text-[11px] text-brand-400 mt-0.5">{sub}</p>}
    </div>
  )
}
