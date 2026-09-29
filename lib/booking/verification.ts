/* 휴대폰 SMS 본인 인증 — 4자리 번호(3분), 5회 오입력 시 폐기, 재발송 1분 1회·1시간 5회, 인증 토큰 30분 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { sendSms, smsConfigured, verificationText } from '@/lib/solapi'
import { alertSmsFailure } from '@/lib/alerts'
import { BookingError } from './errors'
import { normalizePhone } from './phone'

export const CODE_TTL_SEC = 180
export const TOKEN_TTL_SEC = 30 * 60
const MAX_ATTEMPTS = 5
const RESEND_GAP_SEC = 60
const MAX_PER_HOUR = 5
const MAX_PER_DAY_TOTAL = 300 // 전체 일일 발송 상한 (비용 보호)

/** 개발용: SMS 없이 인증번호 0000 (운영에서는 무시) */
const dryRun = () => process.env.SMS_DRY_RUN === 'true' && process.env.NODE_ENV !== 'production'

/** 인증 사용 여부 — 솔라피 설정이 있거나 개발용 dry-run 이면 켜짐 */
export function verificationEnabled() {
  return smsConfigured() || dryRun()
}

const pepper = () => process.env.VERIFY_SECRET || process.env.BOOKING_API_KEY || ''
const hash = (s: string) => createHash('sha256').update(`${s}:${pepper()}`).digest('hex')

function sameHash(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

export async function requestCode(rawPhone: unknown) {
  const phone = normalizePhone(rawPhone)

  const since = iso(-3600 * 1000)
  const { data: recent, error } = await supabase
    .from('sh_shop_phone_verifications')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw new BookingError('INTERNAL', '잠시 후 다시 시도해 주세요.')
  const last = recent?.[0] ? Date.parse(recent[0].created_at) : 0
  if (Date.now() - last < RESEND_GAP_SEC * 1000) {
    throw new BookingError('TOO_MANY_REQUESTS', '인증번호는 1분 후에 다시 받을 수 있어요.')
  }
  if ((recent?.length ?? 0) >= MAX_PER_HOUR) {
    throw new BookingError('TOO_MANY_REQUESTS', '인증 요청이 너무 많아요. 1시간 후 다시 시도하거나 매장으로 전화 주세요.')
  }
  const { count } = await supabase
    .from('sh_shop_phone_verifications')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', iso(-24 * 3600 * 1000))
  if ((count ?? 0) >= MAX_PER_DAY_TOTAL) {
    throw new BookingError('TOO_MANY_REQUESTS', '지금은 인증번호를 보낼 수 없어요. 매장으로 전화 주세요.')
  }

  const code = dryRun() ? '0000' : String(randomInt(0, 10000)).padStart(4, '0')
  const { error: insErr } = await supabase.from('sh_shop_phone_verifications').insert({
    phone,
    code_hash: hash(`${phone}:${code}`),
    expires_at: iso(CODE_TTL_SEC * 1000),
  })
  if (insErr) throw new BookingError('INTERNAL', '잠시 후 다시 시도해 주세요.')

  if (!dryRun()) {
    const sent = await sendSms(phone, verificationText(code))
    if (!sent.ok) {
      await alertSmsFailure(phone, sent.reason).catch(e => console.error('SMS 실패 알림 오류', e))
      throw new BookingError('SMS_FAILED', '인증번호 발송에 실패했어요. 잠시 후 다시 시도하거나 매장으로 전화 주세요.')
    }
  }
  return { expires_in: CODE_TTL_SEC, resend_after: RESEND_GAP_SEC }
}

export async function confirmCode(rawPhone: unknown, rawCode: unknown) {
  const phone = normalizePhone(rawPhone)
  const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : ''
  if (code.length !== 4) throw new BookingError('INVALID_INPUT', '인증번호 4자리를 입력해 주세요.')

  const { data: row } = await supabase
    .from('sh_shop_phone_verifications')
    .select('id, code_hash, expires_at, attempts, verified_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row || row.verified_at || Date.parse(row.expires_at) < Date.now()) {
    throw new BookingError('CODE_EXPIRED', '인증번호가 만료되었어요. 다시 받아 주세요.')
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new BookingError('CODE_EXPIRED', '입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요.')
  }

  if (!sameHash(row.code_hash, hash(`${phone}:${code}`))) {
    // 동시 요청에도 횟수 초과가 되지 않도록 현재 값 조건으로 증가
    await supabase.from('sh_shop_phone_verifications').update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('attempts', row.attempts)
    const left = MAX_ATTEMPTS - row.attempts - 1
    throw new BookingError('CODE_MISMATCH', left > 0 ? `인증번호가 맞지 않아요. (남은 횟수 ${left}회)` : '입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요.')
  }

  const token = randomBytes(24).toString('base64url')
  const { data: done } = await supabase
    .from('sh_shop_phone_verifications')
    .update({ verified_at: new Date().toISOString(), token_hash: hash(`token:${token}`), token_expires_at: iso(TOKEN_TTL_SEC * 1000) })
    .eq('id', row.id)
    .is('verified_at', null)
    .select('id')
    .maybeSingle()
  if (!done) throw new BookingError('CODE_EXPIRED', '이미 사용된 인증번호예요. 다시 받아 주세요.')
  return { verification_token: token, expires_in: TOKEN_TTL_SEC }
}

/** 인증 토큰이 이 휴대폰 번호로 발급되었고 아직 유효한지 */
export async function isVerified(phone: string, token: unknown) {
  if (typeof token !== 'string' || token.length < 20) return false
  const { data } = await supabase
    .from('sh_shop_phone_verifications')
    .select('phone, token_expires_at')
    .eq('token_hash', hash(`token:${token}`))
    .maybeSingle()
  return !!data && data.phone === phone && Date.parse(data.token_expires_at) > Date.now()
}

/**
 * 요청자가 이 휴대폰 번호의 소유자인지 — 인증 사용 중이면 유효한 verification_token 필수.
 * 정규화된 번호를 반환.
 */
export async function requireVerifiedPhone(input: { phone?: unknown; verification_token?: unknown }) {
  const phone = normalizePhone(input.phone)
  if (verificationEnabled() && !(await isVerified(phone, input.verification_token))) {
    throw new BookingError('VERIFICATION_REQUIRED', '휴대폰 인증이 필요해요.')
  }
  return phone
}
