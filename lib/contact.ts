/* 고객을 휴대폰 연락처에 저장 — vCard 파일 (안드로이드 크롬은 intent 로 연락처 앱을 열 수 없어 파일 방식)
 * 메모에는 저장 시점까지의 시술 내역 (이후 변경은 반영되지 않음) */
import { isoToKst } from './booking/time'

const NOTE_MAX = 30 // 메모가 너무 길어지지 않게 최근 시술만

/** 휴대폰 번호 표시용 '-' — 01012345678 → 010-1234-5678 (10자리 010-123-4567), 그 외 형식은 그대로 */
export function formatPhone(p: string | null | undefined) {
  const d = (p ?? '').replace(/\D/g, '')
  if (/^01\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (/^01\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return p ?? ''
}

/** 완료된 시술 내역 메모 — 최신순, 'YYYY.MM.DD 시술명' */
export function treatmentNote(reservations: { start_at: string; product_name: string | null; status: string }[], now = new Date()) {
  const done = reservations.filter(r => r.status === 'completed').sort((a, b) => b.start_at.localeCompare(a.start_at))
  if (!done.length) return ''
  const lines = done.slice(0, NOTE_MAX).map(r => `${isoToKst(r.start_at).date.replace(/-/g, '.')} ${r.product_name ?? '시술'}`)
  if (done.length > NOTE_MAX) lines.push(`외 ${done.length - NOTE_MAX}건`)
  return [`온:플로우 시술 내역 (${isoToKst(now.toISOString()).date.replace(/-/g, '.')} 기준, 총 ${done.length}회)`, ...lines].join('\n')
}

/** vCard 3.0 — 특수문자(\ , ;) 이스케이프 */
export function contactVCard(name: string, phone: string, note = '') {
  const esc = (s: string) => s.replace(/[\\,;]/g, m => `\\${m}`)
  const v = (s: string) => esc(s).replace(/\r?\n/g, ' ')
  const n = esc(note).replace(/\r?\n/g, '\\n') // NOTE 줄바꿈은 \n 으로
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${v(name)}`, `N:${v(name)};;;;`, `TEL;TYPE=CELL:${formatPhone(phone)}`, ...(n ? [`NOTE:${n}`] : []), 'END:VCARD', ''].join('\r\n')
}

/** vCard 파일 내려받기 — 열면 연락처 앱으로 가져오기 (브라우저 전용) */
export function downloadContact(name: string, phone: string, note = '') {
  const url = URL.createObjectURL(new Blob([contactVCard(name, phone, note)], { type: 'text/x-vcard' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.vcf` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000) // 모바일은 바로 해제하면 다운로드가 취소될 수 있음
}
