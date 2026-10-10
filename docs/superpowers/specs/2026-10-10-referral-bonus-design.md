# 소개 보너스 · 보너스 수동 추가 설계 (2026-10-10)

## 목적
A 고객의 소개로 온 B 고객이 관리를 받으면, B의 첫 관리일부터 1년 동안 B가 관리받은 금액의 10%를 A에게 보너스 포인트(선불 보너스 잔액)로 적립한다.
별도로, 관리자가 고객에게 보너스를 수동으로 추가할 수 있게 한다.

## 확정된 결정
| 항목 | 결정 |
|------|------|
| 적립 시점 | B의 관리 완료(결제) 때마다 즉시 |
| 계산 기준 | 결제 총액(`total_amount`) × 10%, 원 미만 버림 — 결제수단 무관 |
| 대상 결제 | B의 유효(`paid`) 결제 중 예약에 연결된 결제 + 첫체험권 결제. 예약 없는 직접 차감(제품 구매 등)은 제외 |
| 기간 | B의 첫 관리일(대상 결제의 서비스일 중 가장 이른 날) + 1년 미만인 서비스일. 서비스일 = 예약 시작일(KST), 첫체험권은 결제일(KST) |
| 소급 | 없음 — 소개자 등록 시각(`referred_at`) 이후 생성된 결제만 |
| 금액 수정·완료 취소 | 차액만 적립/회수. 회수는 A의 보너스 잔액 한도 내, 부족분은 포기(원장 메모에 기록) |
| 이중 지급 방지 | 결제별 "받아야 할 금액"을 `sh_shop_referral_rewards`에 저장하고 그 차이만 원장 반영 |
| 소개자 변경 | 해당 B에 보상 기록이 하나라도 있으면 변경 불가. 자기 자신 불가 |
| 포인트 형태 | 기존 `prepaid_bonus` 잔액 — 결제에 사용, 환불 시 소멸, 매출 아님 |
| 수동 추가 | 추가만(차감 없음), 금액·사유 필수, 원장 `bonus_grant` |

## 데이터 (`docs/sql/2026-10-10-referral.sql`)
- `sh_shop_customers.referred_by` (소개자, 삭제 시 null), `referred_at`, 자기 참조 금지 CHECK
- `sh_shop_referral_rewards(payment_id PK, referrer_id, referred_id, reward_amount)`
- 원장 타입 추가: `referral`(적립, bonus +), `referral_revoke`(회수, bonus −), `bonus_grant`(수동, bonus +). `cash_amount` 는 항상 0, `payment_id` 로 B의 결제와 연결
- DB 함수
  - `sh_shop_referral_sync(payment_id)` — 받아야 할 금액 재계산 → 차액 원장 반영 → 기록 갱신 (멱등)
  - 트리거: `sh_shop_payments` insert / `total_amount`·`status` update, `sh_shop_trial_packages` insert(첫체험 결제 연결 시점) → sync. 같은 트랜잭션
  - `sh_shop_set_referrer(customer_id, referrer_id|null)` — 검증(SELF_REFERRAL, REFERRER_NOT_FOUND, REFERRAL_LOCKED) 후 저장
  - `sh_shop_bonus_grant(customer_id, amount, memo)`

## API
- `GET /api/customers/[id]/referral` — 소개자, 적용 기간(시작·종료), 이 고객으로 A가 받은 보너스, 변경 가능 여부, 이 고객이 소개한 고객 목록(고객별 누적 보너스·기간 종료일)
- `PUT /api/customers/[id]/referral` `{ referrer_id | null }`
- `POST /api/customers` 에 `referred_by` 선택 입력
- `POST /api/customers/[id]/bonus` `{ amount, memo }`
- 모든 변경은 고객 이력(`sh_shop_customer_history`)에 기록

## 화면
- 고객 상세: "소개" 카드 — 소개자 표시·지정(이름/전화 검색), 적용 기간, 소개한 고객 목록
- 고객 추가 폼: 소개자 선택(선택)
- 선불 카드: "보너스 추가" 버튼(금액·사유), 원장 라벨(소개 보너스 / 소개 보너스 회수 / 보너스 추가)과 메모 표시
- 완료 결제창: 소개자가 있고 기간 내면 "A님께 소개 보너스 N원 적립" 안내
- 가계부 선불 현황: "보너스 지급" 행 추가(소개 적립 − 회수 + 수동 추가). 매출 집계는 변화 없음

## 계산 규칙 공유
`lib/referral.ts` 순수 함수(`referralReward`, `referralWindow`)를 화면 미리보기·테스트에 사용. DB 함수에도 동일 규칙(10%, 버림, +1년)을 둔다.

## 테스트
- Vitest: `lib/referral.ts`(버림, 1년 경계·윤년), `lib/ledger/summary.ts`(보너스 지급 행)
- 스모크 `scripts/referral-smoke.mjs`: 소개 등록 → 완료 시 10% 적립 → 금액 증감 차액 → A 보너스 사용 후 완료 취소 시 잔액 한도 회수 → 재완료 시 이중 지급 없음 → 소개자 변경 잠금 → 수동 보너스 추가 → 매출 불변. 테스트 데이터 정리
