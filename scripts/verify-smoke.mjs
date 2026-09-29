// SMS 인증 흐름 점검 — 서버를 SMS_DRY_RUN=true BOOKING_ONLINE_CHANGE=true 로 띄운 뒤 실행 (인증번호 0000)
// 사용법: node scripts/verify-smoke.mjs [baseUrl]
import { check, cleanupTestData, env, finish, sql } from './smoke-lib.mjs'

const BASE = (process.argv[2] || 'http://localhost:3210') + '/api/public/v1'
const H = { Authorization: `Bearer ${env.BOOKING_API_KEY}`, 'Content-Type': 'application/json' }
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const kst = new Date(Date.now() + 9 * 3600e3)
const dow = kst.getUTCDay()
const plus = n => new Date(kst.getTime() + n * 86400e3).toISOString().slice(0, 10)
const TUE = plus(((2 - dow + 7) % 7) + 7)

const cleanVerifications = () => sql(`delete from sh_shop_phone_verifications where phone like '0109999%'`)
await cleanupTestData(); await cleanVerifications()
try {
  const A = '01099990201', B = '01099990202'

  let r = await call('POST', '/verifications', { phone: '010-9999-0201' })
  check('인증번호 요청', r.status === 200 && r.body.expires_in === 180, r)
  r = await call('POST', '/verifications', { phone: A })
  check('1분 내 재요청 → 429', r.status === 429 && r.body.error.code === 'TOO_MANY_REQUESTS', r)
  r = await call('POST', '/verifications/confirm', { phone: A, code: '1111' })
  check('틀린 번호 → CODE_MISMATCH (남은 횟수)', r.status === 400 && r.body.error.code === 'CODE_MISMATCH' && r.body.error.message.includes('4회'), r)
  r = await call('POST', '/verifications/confirm', { phone: A, code: '12' })
  check('4자리 아님 → INVALID_INPUT', r.status === 400 && r.body.error.code === 'INVALID_INPUT', r)
  r = await call('POST', '/verifications/confirm', { phone: A, code: '0000' })
  const tokenA = r.body?.verification_token
  check('맞는 번호 → 토큰 발급', r.status === 200 && typeof tokenA === 'string' && r.body.expires_in === 1800, r)
  r = await call('POST', '/verifications/confirm', { phone: A, code: '0000' })
  check('같은 번호 재사용 불가', r.status === 400 && r.body.error.code === 'CODE_EXPIRED', r)

  // 예약 신청: 토큰 필수
  const booking = { name: '인증테스트', phone: A, program_id: 2, date: TUE, time: '11:00' }
  r = await call('POST', '/reservations', booking)
  check('토큰 없이 예약 → VERIFICATION_REQUIRED', r.status === 401 && r.body.error.code === 'VERIFICATION_REQUIRED', r)
  r = await call('POST', '/reservations', { ...booking, verification_token: 'x'.repeat(32) })
  check('가짜 토큰 → 401', r.status === 401, r)
  r = await call('POST', '/reservations', { ...booking, verification_token: tokenA })
  const id = r.body?.id
  check('토큰으로 예약 성공', r.status === 201 && id, r)

  // 다른 번호의 토큰으로는 불가
  await call('POST', '/verifications', { phone: B })
  const tokenB = (await call('POST', '/verifications/confirm', { phone: B, code: '0000' })).body?.verification_token
  r = await call('POST', '/reservations', { ...booking, phone: B, verification_token: tokenA, time: '14:00' })
  check('A 토큰으로 B 번호 예약 불가', r.status === 401, r)

  // 조회: 토큰만으로(이름 불필요)
  r = await call('GET', `/reservations?phone=${A}`)
  check('토큰 없이 조회 → 401', r.status === 401, r)
  r = await call('GET', `/reservations?phone=${A}&verification_token=${tokenA}`)
  check('인증 후 이름 없이 조회 + 변경 가능', r.status === 200 && r.body.reservations.some(x => x.id === id && x.editable === true), r)
  r = await call('GET', `/reservations?phone=${B}&verification_token=${tokenB}`)
  check('B 로는 A 예약 안 보임', r.status === 200 && !r.body.reservations.some(x => x.id === id), r)
  r = await call('GET', `/customers/lookup?phone=${A}&verification_token=${tokenA}`)
  check('인증 후 회원 조회', r.status === 200 && r.body.exists === true, r)
  r = await call('GET', `/customers/lookup?phone=${A}`)
  check('토큰 없이 회원 조회 → 401', r.status === 401, r)

  // 온라인 변경·취소 (인증 필요)
  r = await call('PATCH', `/reservations/${id}`, { phone: A, time: '12:00' })
  check('토큰 없이 변경 → 401', r.status === 401, r)
  r = await call('PATCH', `/reservations/${id}`, { phone: B, verification_token: tokenB, time: '12:00' })
  check('다른 사람 번호로 변경 → NOT_FOUND', r.status === 404, r)
  r = await call('PATCH', `/reservations/${id}`, { phone: A, verification_token: tokenA, time: '12:00' })
  check('인증 후 변경', r.status === 200 && r.body.start_time === '12:00', r)
  r = await call('POST', `/reservations/${id}/cancel`, { phone: A, verification_token: tokenA })
  check('인증 후 취소', r.status === 200 && r.body.status === 'cancelled', r)

  // 5회 오입력 시 폐기
  await sql(`delete from sh_shop_phone_verifications where phone = '01099990203'`)
  await call('POST', '/verifications', { phone: '01099990203' })
  for (let i = 0; i < 5; i++) await call('POST', '/verifications/confirm', { phone: '01099990203', code: '9999' })
  r = await call('POST', '/verifications/confirm', { phone: '01099990203', code: '0000' })
  check('5회 틀린 뒤에는 맞는 번호도 거부', r.status === 400 && r.body.error.code === 'CODE_EXPIRED', r)

  const stored = await sql(`select code_hash, token_hash from sh_shop_phone_verifications where phone = '${A}' limit 1`)
  check('DB 에는 해시만 저장', stored[0] && stored[0].code_hash.length === 64 && !stored[0].code_hash.includes('0000'), stored)
} finally {
  await cleanupTestData(); await cleanVerifications()
}
finish()
