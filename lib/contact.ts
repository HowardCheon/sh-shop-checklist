/* 고객을 휴대폰 연락처에 저장 — 안드로이드는 '새 연락처' 화면을 바로 열고, 그 외는 vCard 파일
 * 메모에는 저장 시점까지의 시술 내역 (이후 변경은 반영되지 않음) */
import { isoToKst } from './booking/time'

const NOTE_MAX = 30 // 메모가 너무 길어지지 않게 최근 시술만

const hyphen = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : p
}

/** 완료된 시술 내역 메모 — 최신순, 'YYYY.MM.DD 시술명' */
export function treatmentNote(reservations: { start_at: string; product_name: string | null; status: string }[], now = new Date()) {
  const done = reservations.filter(r => r.status === 'completed').sort((a, b) => b.start_at.localeCompare(a.start_at))
  if (!done.length) return ''
  const lines = done.slice(0, NOTE_MAX).map(r => `${isoToKst(r.start_at).date.replace(/-/g, '.')} ${r.product_name ?? '시술'}`)
  if (done.length > NOTE_MAX) lines.push(`외 ${done.length - NOTE_MAX}건`)
  return [`온:플로우 시술 내역 (${isoToKst(now.toISOString()).date.replace(/-/g, '.')} 기준, 총 ${done.length}회)`, ...lines].join('\n')
}

/** 안드로이드 연락처 앱의 새 연락처 화면 (이름·번호·메모 채워짐) */
export function androidContactIntent(name: string, phone: string, note = '') {
  const e = encodeURIComponent
  return `intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;S.name=${e(name)};S.phone=${e(hyphen(phone))};${note ? `S.notes=${e(note)};` : ''}end`
}

/** vCard 3.0 — 특수문자(\ , ;) 이스케이프 */
export function contactVCard(name: string, phone: string, note = '') {
  const esc = (s: string) => s.replace(/[\\,;]/g, m => `\\${m}`)
  const v = (s: string) => esc(s).replace(/\r?\n/g, ' ')
  const n = esc(note).replace(/\r?\n/g, '\\n') // NOTE 줄바꿈은 \n 으로
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${v(name)}`, `N:${v(name)};;;;`, `TEL;TYPE=CELL:${hyphen(phone)}`, ...(n ? [`NOTE:${n}`] : []), 'END:VCARD', ''].join('\r\n')
}
