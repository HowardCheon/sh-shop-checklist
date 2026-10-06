# 시술 완료 첫체험 차감 · 직접 충전 · 금액 수정 · 방문 이력 수정 설계

- 작성일: 2026-10-06
- 선행: `2026-10-06-trial-package-design.md`, `2026-09-28-prepaid-payment-auth-design.md`
- 원칙: 이 관리 사이트는 실제 결제(PG)와 연동되지 않은 **기록장**이다. 금액 수정은 기록을 고치고 이력을 남기는 것으로 충분하다.

## 1. 확정된 요구사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 예약 리스트 첫체험 표시 | 유효 첫체험권에 남은 횟수가 있는 고객의 예약 카드에 `첫체험 B{베이직 남은}·S{스페셜 남은}` 배지. 만료 시 빨간색 |
| 2 | 시술 완료 시 첫체험 차감 | 결제 시트에 "첫체험 사용"(남은 횟수 있을 때만). 베이직 / 스페셜(4종 선택). 예약 시술과 무관하게 선택 가능. 선택 시 결제 금액 자동 0원(수정 가능). 예약 시술명으로 기본 선택 추정. 만료면 확인창 후 허용 |
| 2-1 | 차감 복원 | 완료 예약을 취소/예약 상태로 되돌리거나 결제 내역에서 그 결제를 취소하면, 그 예약에 연결된 첫체험 사용도 자동 취소(횟수 복원) |
| 3 | 직접 금액 충전 | 고객 상세 선불 카드에 [직접 입력]: 충전 금액(필수, 1원 이상 정수) + 보너스(선택, 0 이상 정수, 기본 0). 정해진 3종 버튼은 유지 |
| 4 | 첫체험권 금액 수정 | 등록 전: 선택한 패키지 금액을 눌러 수정 후 등록. 등록 후: 카드의 금액을 눌러 수정 → 패키지 가격 + 연결 결제 금액 함께 수정, 고객 이력 기록 |
| 5 | 방문 이력 수정 | 고객 상세의 예약(방문 이력·예정 예약) 항목을 누르면 예약 수정 화면(예약 관리와 동일)을 띄움. 완료 예약의 금액을 바꾸면 결제 금액도 함께 수정 |
| - | 결제 시트 금액 변경 | 이미 지원(변경 없음) |

## 2. 결제 금액 수정 규칙 (4·5 공통)

`sh_shop_payment_adjust(payment_id, new_total, other_method)`:
- 선불 차감액(실제·보너스)은 그대로 두고, 차액은 기타 결제분(카드/현금/계좌이체)에서 조정: `other = new_total - (prepaid_cash_used + prepaid_bonus_used)`
- `other < 0` → `BELOW_PREPAID` (선불로 낸 금액보다 낮출 수 없음 — 등록 취소/결제 취소 후 다시 처리 안내)
- `other > 0` 이고 기존 결제수단이 없으면 `other_method` 필수(없으면 `OTHER_METHOD_REQUIRED`). 기존 결제수단이 있으면 유지(인자로 바꿀 수 있음)
- `other = 0` → 결제수단 null
- 취소된 결제는 `ALREADY_VOIDED`
- 결제 행 `FOR UPDATE`, 반환: 수정된 결제 행

## 3. 데이터 (마이그레이션: `docs/sql/2026-10-06-completion-trial.sql`)

```sql
alter table sh_shop_trial_uses add column if not exists reservation_id bigint references sh_shop_reservations(id) on delete set null;
create index if not exists sh_shop_trial_uses_reservation_idx on sh_shop_trial_uses(reservation_id) where reservation_id is not null;
```

DB 함수:
| 함수 | 변경 |
|---|---|
| `sh_shop_trial_use(package_id, kind, care_name, memo, reservation_id default null)` | 기존 4인자 함수를 대체(삭제 후 재생성). 사용 행에 reservation_id 기록 |
| `sh_shop_payment_adjust(payment_id, total, other_method)` | 신규 (2절) |
| `sh_shop_trial_price(package_id, price, other_method)` | 신규. 유효 패키지 잠금 → price 변경 → 연결 결제가 paid 면 `sh_shop_payment_adjust`. 반환 `{package, payment}` |

모두 service_role 만 실행.

## 4. 서버

- `lib/trial.ts`: `useTrial(..., reservationId?)`, `cancelReservationTrialUses(reservationId)` (그 예약의 used 사용을 모두 `cancelTrialUse`), `changeTrialPrice(packageId, price, otherMethod)` + 이력
- `lib/payments.ts`: `adjustPayment(paymentId, total, otherMethod)` + 이력, 오류 코드 `BELOW_PREPAID`
- `POST /api/reservations/{id}/complete`: 입력에 `trial?: { package_id, kind, care_name? }` 추가. 순서: 결제 → 첫체험 사용(reservation_id 연결) → 상태 completed. 첫체험 실패 시 결제 취소 후 오류, 상태 변경 실패 시 첫체험 사용·결제 모두 되돌림. 이력에 첫체험 사용 포함
- `PUT /api/reservations/{id}`: 완료→취소/예약 전환 시 결제 취소에 이어 `cancelReservationTrialUses`. 완료 상태 유지 + price 변경 시 그 예약의 paid 결제를 `adjustPayment`(입력 `payment_method?`), 실패하면 예약 수정도 하지 않음
- `POST /api/payments/{id}/void`: 예약 결제면 예약 복원과 함께 `cancelReservationTrialUses`
- `GET /api/reservations`(목록) 및 예약 페이지 초기 로드: 응답 예약마다 `trial: { basic_left, special_left, expires_on } | null` (고객의 유효 패키지, 별도 조회 후 병합)
- `POST /api/customers/{id}/charge`: `{ amount, bonus?, custom? }` — `custom: true` 면 amount ≥1, bonus ≥0 정수 검증 후 그대로 충전(메모 기본 "직접 충전"), 아니면 기존 3종 규칙
- `PATCH /api/trial/{packageId}`: `{ price, other_method? }` → `changeTrialPrice`
- `POST /api/customers/{id}/trial`: `price?` 추가 — 없으면 상수 가격, 있으면 1원 이상 정수 검증 후 그 금액으로 등록

## 5. 순수 모듈 (단위 테스트)

- `lib/booking/trial.ts`: `trialBadge(pkg, today)` → `{ label: '첫체험 B1·S2', expired } | null` (남은 횟수 0 이면 null), `defaultTrialChoice(productName)` → `{ kind: 'basic' } | { kind: 'special', care } | null` (`베이직` 포함 → basic, `플라즈마`/`로즈`/`상체`/`하체` 포함 → 해당 스페셜)
- `lib/booking/prepaid.ts`: `validateCustomCharge(amount, bonus)`

## 6. 화면

- 예약 리스트 카드: `MemberBadge` 옆에 첫체험 배지
- 결제 시트(`PaymentSheet`): 고객 첫체험 조회(`GET /api/customers/{id}/trial`). 남은 횟수 있으면 "첫체험 사용" 토글 → 베이직/스페셜 선택(스페셜이면 4종 칩), 켜면 금액 0(끄면 원래 금액 복원). 완료 버튼 문구에 첫체험 표시
- 고객 상세 선불 카드: [직접 입력] 펼침 → 금액·보너스 입력 → 확인창 후 충전
- 첫체험 카드: 등록 폼의 금액을 누르면 입력칸(기본 상수 가격). 등록 후 카드 금액을 누르면 입력칸 + (필요 시) 결제수단 칩 → 저장
- 고객 상세 방문 이력·예정 예약 항목 탭 → 예약 수정 폼(`ReservationForm` 를 `app/reservations/ReservationForm.tsx` 로 분리해 공용). 완료 예약이면 결제수단 칩(추가 결제분용) 표시. 저장 후 페이지 갱신

## 7. 테스트

- 단위: `trialBadge`, `defaultTrialChoice`, `validateCustomCharge`
- 통합(`scripts/completion-smoke.mjs`):
  - 첫체험 차감 완료(금액 0) → 사용에 reservation_id → 예약 취소 시 결제 취소 + 첫체험 복원 → 예약 복원 후 다시 완료
  - 결제 내역에서 결제 취소 → 첫체험 복원 + 예약 상태 복원
  - 차감 + 추가 금액(카드) 완료
  - 직접 충전(금액·보너스), 잘못된 값 400
  - 첫체험 금액: 등록 시 지정 가격, 등록 후 올리기(결제수단 필요)·내리기·선불 이하 거부(409)
  - 완료 예약 금액 수정 → 결제 금액 동기화
  - 예약 목록 응답에 trial 정보
- 브라우저: 예약 리스트 배지, 결제 시트 첫체험 선택, 고객 상세 직접 충전·금액 수정·방문 이력 수정

## 8. 제외

- 실제 PG/카드사 연동, 첫체험 일부 사용 후 환불
