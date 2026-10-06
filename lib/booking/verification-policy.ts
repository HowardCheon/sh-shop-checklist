/**
 * 휴대폰 인증 필요 여부 — 운영에서는 항상 필수(SMS 설정이 빠져도 인증이 꺼지지 않고 발송 단계에서 막힘).
 * 개발 환경만 솔라피 설정 또는 dry-run 일 때 켜짐.
 */
export function verificationRequired(env: { production: boolean; smsConfigured: boolean; dryRun: boolean }) {
  return env.production || env.smsConfigured || env.dryRun
}
