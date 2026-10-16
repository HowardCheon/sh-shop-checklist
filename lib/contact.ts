/* 고객을 휴대폰 연락처에 저장 — 안드로이드는 '새 연락처' 화면을 바로 열고, 그 외는 vCard 파일 */

const hyphen = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : p
}

/** 안드로이드 연락처 앱의 새 연락처 화면 (이름·번호 채워짐) */
export function androidContactIntent(name: string, phone: string) {
  const e = encodeURIComponent
  return `intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;S.name=${e(name)};S.phone=${e(hyphen(phone))};end`
}

/** vCard 3.0 — 특수문자(\ , ;) 이스케이프 */
export function contactVCard(name: string, phone: string) {
  const v = (s: string) => s.replace(/[\\,;]/g, m => `\\${m}`).replace(/\r?\n/g, ' ')
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${v(name)}`, `N:${v(name)};;;;`, `TEL;TYPE=CELL:${hyphen(phone)}`, 'END:VCARD', ''].join('\r\n')
}
