/* 고객번호 동그라미 — 고객 목록·상세, 예약 목록·상세 공용. 번호가 없으면(고객 미연결) 회색 '?' */
const SIZE = {
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-10 h-10 text-sm',
} as const

export default function CustomerNo({ no, size = 'md' }: { no?: number | null; size?: keyof typeof SIZE }) {
  const has = typeof no === 'number'
  return (
    <span
      title={has ? `고객번호 ${no}` : '고객 미연결'}
      className={`${SIZE[size]} rounded-full inline-flex items-center justify-center font-serif font-bold shrink-0 tabular-nums border ${
        has ? 'text-brand-600 bg-brand-50 border-brand-200' : 'text-gray-300 bg-gray-50 border-dashed border-gray-300'
      }`}
    >
      {has ? no : '?'}
    </span>
  )
}
