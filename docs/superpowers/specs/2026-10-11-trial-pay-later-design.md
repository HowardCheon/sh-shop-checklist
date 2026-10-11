# 첫체험권 나중에 결제 설계 (2026-10-11)

## 목적
첫체험권을 등록하면 바로 결제(매출)로 잡히는 문제 해결. 관리 먼저 받고 나중에 결제하는 경우가 많으므로 등록과 결제를 분리한다.

## 확정된 결정
| 항목 | 결정 |
|------|------|
| 등록 기본값 | 나중에 결제(미결제). "지금 결제"를 고르면 기존처럼 등록과 동시에 결제 |
| 미결제 정의 | 유효 패키지의 `payment_id` 가 없고 `price > 0` |
| 미결제 사용 | 허용 (관리 후 결제) |
| 결제 받는 곳 | 시술 완료 결제창("첫체험권 미결제 N원 — 이번에 함께 결제" 기본 선택) + 고객 상세 첫체험 카드 "결제하기" |
| 결제 기록 | 첫체험 결제는 시술 결제와 별도 1건, 예약과 연결하지 않음 → 가계부 '첫체험' 매출로 결제일에 잡힘 |
| 결제 되돌리기 | 첫체험 카드 "결제 취소" → 결제 취소 + 미결제로 복귀. 시술 완료를 되돌려도 첫체험 결제는 유지 |
| 소개 보너스 | 결제가 패키지에 연결될 때 적립 (트리거) |
| 0원 패키지 | 결제할 것이 없으므로 미결제 표시 없음 |

## DB (`docs/sql/2026-10-11-trial-pay-later.sql`)
- `sh_shop_trial_register(..., p_pay_now boolean default true)` — false 면 결제 없이 패키지만
- `sh_shop_trial_pay(p_package_id, p_use_prepaid, p_other_method)` — 미결제 유효 패키지만(ALREADY_PAID / PACKAGE_CANCELLED), `sh_shop_pay` 로 결제(예약 없음) 후 연결
- `sh_shop_trial_unpay(p_package_id)` — 연결 해제 후 결제 취소(NOT_PAID). 완료 처리 실패 시 롤백에도 사용
- 소개 보너스 트리거: `sh_shop_trial_packages` insert 또는 `payment_id` update 시 sync
- 금액 수정(`sh_shop_trial_price`)·등록 취소(`sh_shop_trial_cancel`)는 미결제를 이미 처리 — 변경 없음

## API
- `POST /api/customers/[id]/trial` 에 `pay_later` (미지정 시 기존처럼 즉시 결제)
- `POST /api/trial/[id]/pay` `{ use_prepaid, other_method }`, `POST /api/trial/[id]/unpay`
- `POST /api/reservations/[id]/complete` 에 `trial_payment: { package_id }` — 첫체험 결제 → 시술 결제 → 첫체험 차감 → 완료 순서, 실패 시 역순 롤백(첫체험 결제는 unpay). 선불 사용 여부·결제수단은 시술 결제와 같은 값

## 화면
- 첫체험 카드: 등록 시 [나중에 결제]/[지금 결제], 미결제 배지 + 결제하기(선불·결제수단), 결제된 패키지 결제 취소, 미결제면 금액 수정에서 결제수단 숨김, 등록 취소 문구 구분
- 시술 완료 결제창: 미결제 안내 + 함께 결제 체크(기본 켜짐), 선불 미리보기·결제수단·버튼 금액은 합계 기준
- 예약 목록 배지: 미결제면 "· 미결제", 횟수를 다 썼어도 미결제면 "첫체험 미결제"
- 결제 내역의 첫체험 결제 취소 시 안내 문구: 첫체험 카드의 결제 취소/등록 취소 안내

## 테스트
- Vitest: `trialBadge` 미결제 표시
- 스모크 `scripts/trial-pay-later-smoke.mjs`: 미결제 등록(결제·매출 없음) → 미결제 사용 → 완료 결제창 함께 결제(결제 2건, 첫체험 결제 예약 미연결) → 이중 결제 거절 → 결제 취소(미결제 복귀) → 카드에서 결제 → 미결제 금액 수정·등록 취소 → 소개 보너스 결제 시 적립 → 완료 실패 시 롤백
- 기존 trial/completion/payment/referral 스모크 회귀
