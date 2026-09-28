# 예약 API 연동 가이드 (v1)

외부 사이트 **서버**에서 호출하는 API 입니다. API Key 는 브라우저에 노출하지 마세요.

- Base URL: `https://<배포도메인>/api/public/v1`
- 인증: `Authorization: Bearer <BOOKING_API_KEY>`
- 형식: JSON (UTF-8). 날짜 `YYYY-MM-DD`, 시각 `HH:mm`, 모두 한국시간(KST)
- 전화번호: `010-1234-5678`, `01012345678`, `+82 10-...` 모두 허용

## 예약 흐름

1. 날짜 선택 → `GET /availability?date=2026-10-06` → 가능한 시각 목록 표시
2. 시각 선택 → `GET /availability/programs?date=2026-10-06&time=14:00[&phone=...]` → 가능한 프로그램(소요시간, 종료시각, 가격) 표시
3. (선택) 전화번호 입력 → `GET /customers/lookup?phone=...` → 회원 여부
4. 예약 → `POST /reservations`
5. 내 예약 → `GET /reservations?phone=...` → `PATCH /reservations/{id}` 또는 `POST /reservations/{id}/cancel`

## 운영 규칙

- 영업: 월–금 10:00–20:00, 토 10:00–17:00, 일요일·지정 휴무일 휴무
- 시작 시각 30분 단위, 마지막 시작은 종료 30분 전(평일 19:30, 토 16:30). 시술은 영업 종료 후에 끝나도 됨
- 1인 운영: 예약은 서로 겹치지 않으며, 각 예약 뒤 정리시간 20분이 자동으로 확보됨
- 예약 가능 기간: 현재 + 2시간 이후 ~ 60일 이내
- 전화번호당 예정 예약 최대 5건
- 수정/취소: 예약일 **전날까지**만 가능 (당일은 매장 전화)
- 회원(선불충전금 보유) 은 회원가, 그 외 비회원가 자동 적용

## 엔드포인트

### GET /programs
```json
{ "programs": [ { "id": 2, "group": "FACE", "name": "베이직 관리", "duration_min": 60, "member_price": 50000, "regular_price": 80000 } ] }
```

### GET /availability?date=
```json
{ "date": "2026-10-06", "closed": false, "closed_reason": null,
  "business_hours": { "open": "10:00", "close": "20:00", "lastStart": "19:30" },
  "slots": [ { "time": "10:00", "program_count": 14 } ] }
```

### GET /availability/programs?date=&time=&phone=
`phone` 을 주면 `is_member`, `applied_price`(적용가) 가 채워집니다.
```json
{ "date": "2026-10-06", "time": "10:00", "is_member": false,
  "programs": [ { "id": 2, "name": "베이직 관리", "duration_min": 60, "end_time": "11:00", "member_price": 50000, "regular_price": 80000, "applied_price": 80000 } ] }
```

### GET /customers/lookup?phone=
```json
{ "exists": true, "is_member": true, "name_masked": "홍*동" }
```

### POST /reservations
요청: `{ "name": "홍길동", "phone": "010-1234-5678", "program_id": 2, "date": "2026-10-06", "time": "14:00", "message": "요청사항" }`

응답 201 (예약 객체):
```json
{ "id": 12, "program": { "id": 2, "name": "베이직 관리", "duration_min": 60 }, "customer_name": "홍길동",
  "date": "2026-10-06", "start_time": "14:00", "end_time": "15:00", "price": 80000, "price_type": "regular",
  "message": "요청사항", "status": "scheduled", "editable": true, "is_member": false }
```

### GET /reservations?phone=
`{ "reservations": [ 예약 객체 ... ] }` — 앞으로 남은 확정 예약만. `editable=false` 면 수정/취소 버튼 대신 매장 전화 안내.

### PATCH /reservations/{id}
요청: `{ "phone": "...", "program_id"?: 3, "date"?: "2026-10-07", "time"?: "15:00", "message"?: "..." }` → 예약 객체

### POST /reservations/{id}/cancel
요청: `{ "phone": "...", "reason"?: "일정 변경" }` → 예약 객체(`status: "cancelled"`)

## 오류

`{ "error": { "code": "SLOT_TAKEN", "message": "..." } }` — `message` 는 고객에게 그대로 보여줘도 되는 문장입니다.

| code | HTTP | 의미 |
|---|---|---|
| UNAUTHORIZED | 401 | API Key 오류 |
| INVALID_INPUT | 400 | 입력 형식 오류 |
| CLOSED_DAY | 422 | 휴무일 |
| OUT_OF_HOURS | 422 | 예약 가능 시각 아님 |
| TOO_SOON / TOO_FAR | 422 | 2시간 이내 / 60일 초과 |
| PROGRAM_NOT_FOUND | 404 | 없는 프로그램 |
| SLOT_TAKEN | 409 | 이미 찬 시간 → 가용시간 다시 조회 |
| LIMIT_EXCEEDED | 409 | 예정 예약 5건 초과 |
| NOT_FOUND | 404 | 예약 없음(전화번호 불일치 포함) |
| SAME_DAY_LOCKED | 403 | 당일 변경 불가 → 매장 전화 |
| INTERNAL | 500 | 일시 오류 |

## 참고

- SMS 인증이 도입되면 수정/취소/목록 조회 요청에 `verification_token` 이 추가될 예정입니다.
- 점검 스크립트: `node scripts/booking-smoke.mjs [baseUrl]` (테스트 데이터 자동 정리)
