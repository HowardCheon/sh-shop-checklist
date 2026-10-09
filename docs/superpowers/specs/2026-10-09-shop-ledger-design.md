# 샵 가계부 이전·개선 설계

- 작성일: 2026-10-09
- 출처: `C:\ai\cafe24\vercel_cafe24` 의 에스테틱 모드(EST_* 테이블, 같은 서울 Supabase)
- 목적(확정): **월별 손익 파악 + 간이과세자 세금 신고 대비**. 매출은 관리자 앱 결제에서 자동, 가계부에는 지출·기타 수입만 직접 입력.

## 1. 확정된 결정

| 항목 | 결정 |
|---|---|
| 사업자 | 간이과세자 — 지출마다 증빙 종류만 구분(부가세액 칸 없음) |
| 매출 | 2026-10-06(KST)부터 관리자 앱 기록에서 자동 계산(조회 시 계산, 저장 안 함). 그 이전은 수기 매출 |
| 중복 | 수기 매출 중 정순영 200정액·국유경 4회권·권영아 4회권·안성희 2회권은 관리자 앱과 중복 → 제외 표시(보존) |
| 구조 | 새 테이블로 재설계 + EST 46건 이전(삭제된 3건 제외). EST_* 원본은 보존 |
| 옛 앱 | cafe24 에스테틱 모드 완전히 숨김(토글 제거) |
| 위치 | 관리자 탭 메뉴 [가계부](첫 화면) / [보낸 문자] |

## 2. 데이터 (마이그레이션 `docs/sql/2026-10-09-ledger.sql`)

```sql
create table sh_shop_ledger_categories (
  id bigint generated always as identity primary key,
  io text not null check (io in ('in','out')),
  name text not null,
  sort integer not null default 0,
  hidden boolean not null default false,
  unique (io, name)
);
create table sh_shop_ledger_entries (
  id bigint generated always as identity primary key,
  entry_date date not null,
  io text not null check (io in ('in','out')),
  amount integer not null check (amount > 0),
  category_id bigint not null references sh_shop_ledger_categories(id),
  method text check (method in ('card','cash','transfer')),
  evidence text not null default 'unknown' check (evidence in ('card','cash_receipt','tax_invoice','none','unknown')),
  vendor text, memo text,
  excluded boolean not null default false, exclude_reason text,
  legacy_est_no integer unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on sh_shop_ledger_entries(entry_date);
```
- 기본 항목 — 지출: 재료비, 제품 매입, 임대료, 관리비·공과금, 통신비, 광고·마케팅, 카드 수수료, 가구·장비, 공사비, 소모품, 세금·보험, 기타 / 수입: 시술 매출(수기), 제품 판매, 기타 수입
- 카테고리 io 와 내역 io 가 같아야 함 — API 에서 검증
- RLS on, 서버(service_role)만 접근

### 이전 규칙 (EST → entries)
- 대상: `DEL_YN <> 'Y'` 46건. 날짜 `USE_YMD`(YYYYMMDD) → date, 결제수단 카드→card, 현금→cash, 계좌이체→transfer, 증빙 unknown, 거래처 `EST_TB_WHERE` 이름은 버림(매장/온라인뿐), 메모 유지, `legacy_est_no = NO`
- 항목 매핑: 재료비→재료비, 임대료→임대료, 공과금→관리비·공과금, 가구/장비→가구·장비, 공사비→공사비, 기타(O)→기타, 시술매출(I)→시술 매출(수기), 제품매출→제품 판매, 기타(I)→기타 수입
- 보정: NO 29(슬리퍼2개, 지출)→소모품, NO 43(커튼맞춤, 지출)→가구·장비, NO 30(고모, 수입)→시술 매출(수기)
- 중복 제외: 메모로 4건(정순영 200정액, 국유경 이벤트4회권, 권영아 이벤트4회권, 안성희 2회권) excluded=true, reason '관리자 앱 기록과 중복'
- 멱등: legacy_est_no 유니크로 재실행 안전

## 3. 자동 매출 (조회 시 계산, `LEDGER_AUTO_FROM = '2026-10-06'` KST 이후)

| 종류 | 출처 | 금액 | 날짜 |
|---|---|---|---|
| 선불 충전 | `sh_shop_prepaid_ledger` type=charge | cash_amount | created_at |
| 첫체험 | `sh_shop_payments` 중 `sh_shop_trial_packages.payment_id` 로 연결된 paid | other_amount | created_at |
| 시술·직접 결제 | 그 외 paid 결제 | other_amount (선불 차감분 제외) | created_at |
| 환불 | prepaid_ledger type=refund | cash_amount(음수) | created_at |

- voided 결제 제외, other_amount 0 인 결제는 내역에 표시하지 않음. 결제수단별(card/cash/transfer, 충전은 method 정보가 없어 '선불 충전'으로 별도) 합계 제공
- 선불 충전 현황: prepaid_ledger 를 cash/bonus 로 나눠 월초 잔액(월 시작 전 합), 충전, 사용(use+use_cancel 순), 환불·소멸(refund), 월말 잔액. 선불 보유 고객 수·고객별 잔액은 현재 기준(sh_shop_customers)

## 4. 서버

- `lib/ledger/` 순수 모듈: `summarizeMonth({ entries, autoRows, prepaidRows, month })` → { prepaid, pnl, byCategory, byEvidence, byMethod, days } (단위 테스트)
- `lib/ledger/repo.ts`: 월 데이터 조회(entries + 자동 매출 rows + prepaid ledger rows)
- API(관리자 쿠키): `GET /api/ledger?month=YYYY-MM`, `POST /api/ledger/entries`, `PUT|DELETE /api/ledger/entries/{id}`, `GET|POST /api/ledger/categories`, `PUT /api/ledger/categories/{id}`(이름·숨김·정렬)
- 검증: 금액 1원 이상 정수, 날짜 형식, 카테고리 io 일치, method/evidence 허용값

## 5. 화면

- `/admin` 상단 메뉴 [가계부][보낸 문자] (`?tab=sms`)
- 가계부: 월 이동, 선불 충전 현황 표(실제/보너스/합계, 고객별 잔액 펼치기), 손익 요약(매출 자동·수기 구분, 종류별, 지출, 순이익), 지출 항목별, 증빙별, 결제수단별 매출, 날짜별 내역(자동 줄은 읽기 전용 + 고객/예약 링크, 직접 입력 줄은 수정/삭제, 제외 줄은 흐리게)
- 입력 시트: 날짜(KST 오늘), 지출/수입, 금액, 항목 칩(사용 많은 순), 결제수단, 증빙, 거래처, 메모, 제외 토글. 마지막 결제수단·증빙 기억(localStorage)
- 항목 관리 시트: 추가·이름 변경·숨김·순서

## 6. 옛 앱(cafe24)

- `public/index.html` 의 가족/에스테틱 토글과 `#est-section` 진입을 제거(항상 가족 모드). API 의 est 경로는 남겨도 화면에서 접근 불가 — `biz=est` 요청은 410 으로 막아 실수 입력 방지

## 7. 테스트

- 단위: summarizeMonth(선불 현황 월초/월말, 자동 매출 종류·결제수단, 제외 제외, 증빙 합계, 수기/자동 구분), 입력 검증
- 통합(`scripts/ledger-smoke.mjs`): 항목 CRUD, 내역 추가·수정·삭제·제외, io 불일치 400, 월 조회에 자동 매출(테스트 고객 충전·결제·첫체험·환불) 반영, 선불 현황 수치
- 이전 검증: 46건 이전, 합계(이전 전 EST 수입/지출 합 = 이전 후 합 + 제외분), 중복 4건 제외, 보정 3건
- 브라우저: 가계부 화면·입력·항목 관리, 옛 앱에서 에스테틱 토글 사라짐

## 변경 (2026-10-09 배포 후)
- 항목 정리: 지출 7개(재료·소모품, 임대·관리비, 광고·마케팅, 수수료·세금, 가구·장비, 공사비, 기타), 수입 2개(제품 판매, 기타 수입). 시술 매출(수기)는 숨김 — `docs/sql/2026-10-09-ledger-categories.sql`
- 증빙·거래처 입력과 증빙별 집계 제거. DB 열(`evidence`, `vendor`)은 비어 있는 채로 남겨 둠
