// 관리자 겹침 허용 · 정리시간 10분 · 문자 문구 수정 점검 — 서버를 SMS_DRY_RUN=true 로 띄운 뒤 실행 (실제 발송 없음)
// 사용법: node scripts/overlap-smoke.mjs [baseUrl] [--no-sms]  (--no-sms: 문자 발송 점검 생략 — 실제 발송 서버일 때)
import { adminClient, check, cleanupTestData, env, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv.slice(2).find(a => !a.startsWith('--')) || 'http://localhost:3210'
const SMS = !process.argv.includes('--no-sms')
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 59 * 86400e3).toISOString().slice(0, 10) // 실제 손님 예약과 겹치지 않도록 먼 날짜
const at = t => `${day}T${t}:00+09:00`
const base = { product_id: 2, product_name: '베이직 피부관리', duration_min: 60, price: 80000 }

await cleanupTestData()
try {
  let r = await call('POST', '/api/reservations', { ...base, customer_name: '겹침A', customer_phone: '010-9999-0081', start_at: at('14:00') })
  const a = r.body.id
  const blk = (await sql(`select end_at, block_end_at, allow_overlap from sh_shop_reservations where id = ${a}`))[0]
  check('정리시간 10분 블록', Date.parse(blk.block_end_at) - Date.parse(blk.end_at) === 10 * 60e3 && blk.allow_overlap === false, blk)

  // 정리 10분 직후(15:10) 시작은 겹침 아님
  r = await call('POST', '/api/reservations', { ...base, customer_name: '바로다음', customer_phone: '010-9999-0082', start_at: at('15:10') })
  check('블록 끝(15:10) 시작은 바로 저장', r.status === 200, r)
  const next = r.body.id

  // 겹침 → 확인 없으면 409, 확인하면 저장
  r = await call('POST', '/api/reservations', { ...base, customer_name: '겹침B', customer_phone: '010-9999-0083', start_at: at('14:30') })
  check('겹치면 확인 요청(409 + 겹치는 예약)', r.status === 409 && ['겹침A', '바로다음'].includes(r.body.conflict?.customer_name), r)
  r = await call('POST', '/api/reservations', { ...base, customer_name: '겹침B', customer_phone: '010-9999-0083', start_at: at('14:30'), allow_overlap: true })
  check('확인 후 겹쳐도 저장', r.status === 200 && r.body.allow_overlap === true, r)
  const b = r.body.id

  // 수정으로 겹치게 → 확인 후 저장, 겹침 해소되면 표시 해제
  r = await call('PUT', `/api/reservations/${next}`, { start_at: at('14:00'), duration_min: 60 })
  check('수정 시 겹침 확인 요청', r.status === 409 && r.body.conflict, r)
  r = await call('PUT', `/api/reservations/${next}`, { start_at: at('14:00'), duration_min: 60, allow_overlap: true })
  check('수정도 확인 후 저장', r.status === 200 && r.body.allow_overlap === true, r)
  r = await call('PUT', `/api/reservations/${next}`, { start_at: at('17:00'), duration_min: 60 })
  check('겹침 없는 시간으로 옮기면 표시 해제', r.status === 200 && r.body.allow_overlap === false, r)

  // 고객 예약 화면: 겹친 예약이 있는 시간은 계속 막힘
  r = await fetch(`${BASE}/api/public/v1/availability/programs?date=${day}&time=14:30`, { headers: { Authorization: `Bearer ${env.BOOKING_API_KEY}` } })
  const progs = await r.json().catch(() => null)
  check('홈페이지 예약: 겹친 시간(14:30)은 예약 불가', r.status === 200 && Array.isArray(progs?.programs) && progs.programs.length === 0, progs)
  r = await fetch(`${BASE}/api/public/v1/programs`, { headers: { Authorization: `Bearer ${env.BOOKING_API_KEY}` } })
  const all = (await r.json().catch(() => null))?.programs ?? []
  const trial = all.find(p => p.name === '첫체험(베이직)')
  check('첫체험(베이직) 39,000원·50분·FACE', trial && trial.regular_price === 39000 && trial.member_price === 39000 && trial.duration_min === 50 && trial.group === 'FACE', trial)

  // 문자 문구 수정 — 이번 한 건만
  if (SMS) {
  const custom = '[온:플로우]\n겹침A님, 문구 수정 테스트입니다.'
  r = await call('POST', `/api/reservations/${a}/sms`, { type: 'confirm', text: custom })
  const log = await sql(`select text from sh_shop_sms_logs where reservation_id = ${a} order by created_at desc limit 1`)
  const hist = await sql(`select description from sh_shop_reservation_history where reservation_id = ${a} and action = 'sms'`)
  check('수정한 문구로 발송·기록', r.status === 200 && r.body.text === custom && log[0]?.text === custom && hist[0]?.description.includes('문구 수정'), [r, log, hist])
  r = await call('POST', `/api/reservations/${a}/sms`, { type: 'remind' })
  check('문구 없이 보내면 기본 문구', r.status === 200 && r.body.text.includes('뵙겠습니다'), r)
  r = await call('POST', `/api/reservations/${a}/sms`, { type: 'confirm', text: '   ' })
  check('빈 문구 → 400', r.status === 400, r)
  r = await call('POST', `/api/reservations/${a}/sms`, { type: 'confirm', text: '가'.repeat(1001) })
  check('2000바이트 초과 → 400', r.status === 400, r)
  }

  void b
} finally {
  await cleanupTestData()
}
finish()
