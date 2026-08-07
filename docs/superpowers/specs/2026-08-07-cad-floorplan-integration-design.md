# CAD 평면도 도구 통합 설계

## 배경 및 목적

`C:\ai\cad`에 독립형(standalone) HTML 파일로 존재하는 3개의 캔버스 기반 평면도 설계 도구를 이 Next.js 프로젝트(`sh_shop_check`)에 편입시켜 온라인으로 접근 가능하게 한다.

- `pg_cad.html` — 가게 평면도 설계 도구 (PC용). `가게 평면도`를 그리는 범용 도구.
- `mobile_cad.html` — 가게 평면도 설계 도구 (모바일용). `pg_cad.html`과 로컬스토리지 키(`shop-floorplan-v1`)가 동일 — 같은 가게 평면도를 다루는 짝.
- `hanam508b_cad.html` — 빌리브하남 508B(사용자 개인 아파트) 도면. 매장 업무와 무관한 개인 용도. 로컬스토리지 키 `hanam508b-floorplan-v1`로 완전히 별개 데이터.

세 도구 모두 캔버스 위에 room/door/furniture 등의 도형(`shapes[]`)을 그리고, `{shapes, canvasCmW, canvasCmH}` 형태의 JSON 스냅샷을 로컬스토리지에 저장/복원하며, JSON 파일 내보내기/가져오기 기능을 갖고 있다.

## 요구사항 (사용자 확정)

1. 가게 평면도(pg_cad/mobile_cad)와 하남 도면 모두 하단 탭 네비게이션에는 노출하지 않고, URL 직접 접근만 가능하게 한다.
2. pg_cad와 mobile_cad는 Supabase에서 **동일한 데이터**를 공유한다. 화면 폭에 따라 자동으로 PC용/모바일용 UI를 보여주는 반응형 단일 페이지로 만든다.
3. hanam508b는 완전히 별도의 데이터로, 숨겨진 URL로만 접근한다.
4. 기존 "브라우저에 저장(💾 저장)" 버튼은 Supabase 저장으로 동작을 교체한다. "불러오기(📂 불러오기)" 버튼은 제거하고, 페이지 접근 시 자동으로 Supabase에서 로드한다.
5. JSON 내보내기/가져오기 기능은 요청대로 변경 없이 그대로 유지한다.

## 아키텍처

### Supabase 테이블

기존 컨벤션(`sh_shop_products`, `sh_shop_customers`, `sh_shop_reservations`, `sh_shop_locations`, `sh_shop_checklist` 등)을 따라 신규 테이블 1개를 추가한다.

```sql
create table sh_shop_floorplans (
  slug text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

- `slug`: `'shop'` (pg_cad/mobile_cad 공용) 또는 `'hanam508b'`
- `data`: 기존 스냅샷 구조 그대로 저장 — `{ shapes: Shape[], canvasCmW: number, canvasCmH: number }`

RLS는 이 프로젝트의 다른 테이블과 동일하게 처리한다(서비스 롤 키 사용 API 라우트를 통해서만 쓰기, 별도 정책 없음 — 기존 테이블들과 동일 패턴을 `runSQL`/Management API로 확인 후 맞춘다).

### API 라우트

`app/api/floorplan/route.ts` — 기존 `app/api/checklist/route.ts` 패턴을 따른다.

- `GET /api/floorplan?slug=shop|hanam508b`
  → `sh_shop_floorplans`에서 해당 `slug` 행 조회. 없으면 `{ data: null }` 반환 (에러 아님).
- `POST /api/floorplan` — body: `{ slug: string, data: object }`
  → `upsert({ slug, data, updated_at: now() }, { onConflict: 'slug' })`. 실패 시 500 + 에러 메시지.

### 라우트 / 페이지

- `app/floorplan/shop/page.tsx` — 클라이언트 컴포넌트. `window.innerWidth`(기준 768px)로 아래 두 컴포넌트 중 하나를 렌더링.
  - `ShopFloorplanDesktop` (pg_cad.html 포팅)
  - `ShopFloorplanMobile` (mobile_cad.html 포팅)
  - 둘 다 slug `'shop'`으로 동일한 `/api/floorplan` 엔드포인트를 사용 — PC/모바일 어디서 열어도 같은 도면을 읽고 쓴다.
- `app/floorplan/hanam508b/page.tsx` — 클라이언트 컴포넌트. hanam508b_cad.html 포팅, slug `'hanam508b'`.

두 라우트 모두 `BottomNav`에 링크를 추가하지 않는다(코드 변경 없음). 전역 `PasswordGate`는 기존과 동일하게 모든 라우트에 적용된다(변경 없음).

## 컴포넌트 포팅 방식

원본 파일들은 각각 900~1100줄의 자기완결형 HTML/CSS/vanilla-JS(IIFE, `document.getElementById` 기반 DOM 조작, `<canvas>` 드로잉)이다. React로 재작성하지 않고 **정적 파일 + iframe** 방식으로 포팅한다(최초 설계였던 `dangerouslySetInnerHTML` 삽입 방식은 원본 JS 안의 백틱/`${}` 템플릿 리터럴이 포팅 시 충돌하고 CSS 격리도 수작업이 필요해 폐기):

- 원본 HTML 파일을 거의 그대로 복사해 `public/floorplan/` 아래 정적 파일로 둔다 — `shop-desktop.html`(pg_cad.html), `shop-mobile.html`(mobile_cad.html), `hanam508b.html`(hanam508b_cad.html). `<style>`/`<script>` 내용은 원본 그대로 유지되므로 CSS 셀렉터 충돌이나 JS 이스케이프 문제가 전혀 없다(독립된 HTML 문서이므로 나머지 앱과 완전히 격리됨).
- `app/floorplan/shop/page.tsx`, `app/floorplan/hanam508b/page.tsx`는 클라이언트 컴포넌트로, 각각 해당 정적 파일을 가리키는 전체화면 `<iframe>`을 렌더링한다.
- `app/floorplan/shop/page.tsx`는 마운트 시 1회 `window.innerWidth`(768px 기준)를 판정해 `shop-desktop.html` 또는 `shop-mobile.html` 중 하나를 iframe `src`로 선택한다. 이후 창 크기 변경에는 반응하지 않는다(작업 중 iframe을 다시 로드해 데이터가 날아가는 것을 방지).
- 정적 HTML 파일은 `public/` 아래에 있으므로 URL을 직접 알면(`/floorplan/shop-desktop.html` 등) PIN 게이트 없이도 접근 가능하다. 기존 PIN 게이트도 클라이언트 저장소 기반의 약한 보호 수준이므로 이번 작업에서는 이 트레이드오프를 허용한다.
- `components/BottomNav.tsx`는 `/floorplan` 경로에서 자기 자신을 렌더링하지 않도록 한다(현재 pathname이 `/floorplan`로 시작하면 `null` 반환). 포팅된 도구가 원본과 동일하게 전체 뷰포트를 쓸 수 있게 하기 위함이며, 하단 탭 메뉴에 항목을 추가하지 않는다는 요구사항과도 일치한다.

### 스크립트에서 수정하는 3곳 (파일마다 동일 패턴)

1. **저장 버튼** (`#saveLocal` 클릭 핸들러)
   - 기존: `localStorage.setItem(STORAGE_KEY, snapshot())`
   - 변경: `fetch('/api/floorplan', { method: 'POST', body: JSON.stringify({ slug: 'shop'|'hanam508b', data: JSON.parse(snapshot()) }) })` 후 성공/실패 토스트 (`showToast` 재사용)
2. **불러오기 버튼** (`#loadLocal`)
   - 버튼 엘리먼트 및 클릭 핸들러 제거
3. **초기 로드** (`init()`)
   - 기존: `localStorage.getItem(STORAGE_KEY)`가 있으면 `restoreSnapshot`, 없으면 `seedDefault()`(hanam508b만 해당)/빈 상태
   - 변경: `init()`을 async로 바꿔 `GET /api/floorplan?slug=...` 호출 → 데이터 있으면 `restoreSnapshot`, 없거나 요청 실패 시 기존 폴백 로직(hanam508b는 `seedDefault()`, shop은 빈 캔버스) 그대로 사용 + 실패 시 토스트

JSON 내보내기(`#exportJson`)/가져오기(`#importJson`, `#fileInput`)는 로직을 건드리지 않는다. 가져오기로 상태를 교체한 뒤 Supabase에 반영하려면 사용자가 별도로 저장 버튼을 눌러야 한다(기존에 로컬스토리지 저장도 자동이 아니라 수동이었던 것과 동일한 동작 방식).

## 데이터 흐름

```
페이지 진입 → GET /api/floorplan?slug=X → 있으면 restoreSnapshot(data) / 없으면 폴백 → render()
저장 버튼 클릭 → POST /api/floorplan {slug, data} → 성공/실패 토스트
JSON 내보내기 → 현재 메모리 상태(snapshot())를 파일로 다운로드 (변경 없음)
JSON 가져오기 → 파일 → restoreSnapshot() → 메모리 상태만 교체 (Supabase 반영은 별도 저장 필요, 변경 없음)
```

## 에러 처리

- 초기 로드 실패(네트워크/서버 오류): 토스트로 알리고 기존 폴백(빈 상태 또는 시드 데이터)으로 진행 — 도구 사용 자체는 막지 않음
- 저장 실패: 토스트로 알리고 메모리 상태 유지 — 사용자가 재시도하거나 JSON 내보내기로 백업 가능

## 테스트 / 검증 방법

- `npm run dev`로 로컬 서버 구동 후 브라우저로 직접 확인:
  - `/floorplan/shop`: 데스크톱 폭에서 PC용 UI, 모바일 폭(또는 반응형 리사이즈)에서 모바일용 UI가 뜨는지 확인
  - 도형 그리기 → 저장 → 새로고침 → 동일 데이터 복원 확인 (PC에서 저장 후 모바일 폭에서 새로고침해도 같은 데이터가 뜨는지까지 확인)
  - `/floorplan/hanam508b`: 동일한 저장/복원 흐름 확인, `shop`과 데이터가 섞이지 않는지 확인
  - JSON 내보내기/가져오기가 기존과 동일하게 동작하는지 확인
  - 다른 탭(체크리스트/시술메뉴/예약/고객)으로 이동 시 CAD 도구의 CSS가 `BottomNav` 등 다른 화면에 영향을 주지 않는지 확인

## 범위 밖 (Out of scope)

- 하단 탭 네비게이션에 평면도 메뉴 추가 (이번 작업에서 제외, 필요 시 추후 별도 작업)
- 인증/권한 강화 (기존 PIN 게이트 그대로 사용)
- 도형 데이터의 실시간 동시 편집/충돌 처리 (단일 사용자 전제, 기존 체크리스트와 동일한 가정)
