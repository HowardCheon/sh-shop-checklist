import BrandHeader from '@/components/BrandHeader'

// 탭 전환 시 서버 응답을 기다리는 동안 즉시 보여줄 화면
export default function Loading() {
  return (
    <div className="min-h-screen">
      <BrandHeader>
        <div className="h-8 w-40 mx-auto rounded-full bg-brand-100/70 animate-pulse" />
      </BrandHeader>
      <div className="px-4 py-4 space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-2xl bg-white/70 border border-brand-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
