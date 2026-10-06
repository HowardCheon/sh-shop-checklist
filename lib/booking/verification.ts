/* 휴대폰 SMS 본인 인증 — 4자리 번호(3분), 5회 오입력 시 폐기, 재발송 1분 1회·번호당 1시간 5회·IP당 1시간 10회, 인증 토큰 30분 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { sendSms, smsConfigured, verificationText } from '@/lib/solapi'
import { alertSmsFailure } from '@/lib/alerts'
import { BookingError } from './errors'
import { normalizePhone } from './phone'
import { verificationRequired } from './verification-policy'

export const CODE_TTL_SEC = 180
export const TOKEN_TTL_SEC = 30 * 60
const MAX_ATTEMPTS = 5
const RESEND_GAP_SEC = 60
const MAX_PER_HOUR = 5
const MAX_PER_DAY_TOTAL = 300 // 전체 일일 발송 상한 (비용 보호)

/** 개발용: SMS 없이 인증번호 0000 (운영에서는 무시) */
const dryRun = () => process.env.SMS_DRY_RUN === 'true' && process.env.NODE_ENV !== 'production'

/** 인증 사용 여부 — 운영은 항상 켜짐, 개발은 솔라피 설정이 있거나 dry-run 일 때 */
export function verificationEnabled() {
  return verificationRequired({ production: process.env.NODE_ENV === 'production', smsConfigured: smsConfigured(), dryRun: dryRun() })
}

const pepper = () => process.env.VERIFY_SECRET || process.env.BOOKING_API_KEY || ''
const hash = (s: string) => createHash('sha256').update(`${s}:${pepper()}`).digest('hex')

function sameHash(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

const MAX_PER_IP_HOUR = 10

const LIMIT_ERRORS: Record<string, string> = {
  RESEND_TOO_SOON: '인증번호는 1분 후에 다시 받을 수 있어요.',
  PHONE_HOURLY_LIMIT: '인증 요청이 너무 많아요. 1시간 후 다시 시도하거나 매장으로 전화 주세요.',
  IP_HOURLY_LIMIT: '인증 요청이 너무 많아요. 잠시 후 다시 시도하거나 매장으로 전화 주세요.',
  DAILY_LIMIT: '지금은 인증번호를 보낼 수 없어요. 매장으로 전화 주세요.',
}

/** 인증번호 발송 — 제한 검사·기록은 DB 함수가 잠금 안에서 한 번에 처리. ip 는 고객 실제 IP(없으면 IP 제한 생략) */
export async function requestCode(rawPhone: unknown, ip: string | null = null) {
  const phone = normalizePhone(rawPhone)
  if (!smsConfigured() && !dryRun()) {
    // 운영에서 솔라피 설정이 빠진 경우 — 인증을 끄지 않고 발송 불가로 막고 관리자에게 알림
    await alertSmsFailure(phone, '솔라피 설정(SOLAPI_*) 없음').catch(e => console.error('SMS 실패 알림 오류', e))
    throw new BookingError('SMS_FAILED', '지금은 인증번호를 보낼 수 없어요. 매장으로 전화 주세요.')
  }

  const code = dryRun() ? '0000' : String(randomInt(0, 10000)).padStart(4, '0')
  const { error } = await supabase.rpc('sh_shop_verification_create', {
    p_phone: phone, p_ip: ip, p_code_hash: hash(`${phone}:${code}`), p_ttl_sec: CODE_TTL_SEC,
    p_resend_gap_sec: RESEND_GAP_SEC, p_max_per_hour: MAX_PER_HOUR, p_max_per_ip_hour: MAX_PER_IP_HOUR, p_max_per_day: MAX_PER_DAY_TOTAL,
  })
  if (error) {
    const limit = Object.keys(LIMIT_ERRORS).find(k => error.message?.includes(k))
    if (limit) throw new BookingError('TOO_MANY_REQUESTS', LIMIT_ERRORS[limit])
    console.error('인증번호 기록 실패', error)
    throw new BookingError('INTERNAL', '잠시 후 다시 시도해 주세요.')
  }

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
  // 비교 전에 시도 1회를 원자적으로 차감 → 동시 오답으로 5회 제한을 넘을 수 없음
  const { data: attempts, error: attemptErr } = await supabase.rpc('sh_shop_verification_attempt', { p_id: row.id, p_max: MAX_ATTEMPTS })
  if (attemptErr) throw new BookingError('INTERNAL', '잠시 후 다시 시도해 주세요.')
  if (attempts == null) {
    throw new BookingError('CODE_EXPIRED', '입력 횟수를 초과했어요. 인증번호를 다시 받아 주세요.')
  }

  if (!sameHash(row.code_hash, hash(`${phone}:${code}`))) {
    const left = MAX_ATTEMPTS - attempts
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
